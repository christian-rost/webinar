from __future__ import annotations

from typing import Any, Dict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import authenticate_user, create_access_token, get_current_user, require_admin
from .config import CORS_ORIGINS
from .controlling_service import get_api_key, run_controlling, set_runtime_api_key

app = FastAPI(title="Webinar Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
async def login(payload: LoginRequest) -> Dict[str, Any]:
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Ungültige Zugangsdaten")
    token = create_access_token({"sub": user["id"], "username": user["username"], "roles": user["roles"]})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/auth/me")
async def me(user: Dict = Depends(get_current_user)) -> Dict[str, Any]:
    return {"id": user.get("sub"), "username": user.get("username"), "roles": user.get("roles", [])}


# ---------------------------------------------------------------------------
# Provider (Mistral API Key)
# ---------------------------------------------------------------------------

class ProviderUpdateRequest(BaseModel):
    key_value: str


@app.get("/api/admin/provider")
async def get_provider(_: Dict = Depends(require_admin)) -> Dict[str, Any]:
    key = get_api_key()
    return {"key_present": bool(key)}


@app.put("/api/admin/provider")
async def update_provider(
    payload: ProviderUpdateRequest,
    _: Dict = Depends(require_admin),
) -> Dict[str, Any]:
    set_runtime_api_key(payload.key_value)
    return {"status": "ok", "key_present": bool(get_api_key())}


# ---------------------------------------------------------------------------
# Controlling
# ---------------------------------------------------------------------------

class ControllingRunRequest(BaseModel):
    input_json: Dict[str, Any]


@app.post("/api/controlling/run")
async def controlling_run(
    payload: ControllingRunRequest,
    _: Dict = Depends(require_admin),
) -> Dict[str, Any]:
    result = run_controlling(payload.input_json)
    if result.get("status") == "error" and not result.get("results"):
        raise HTTPException(status_code=400, detail=result.get("reason", "Unbekannter Fehler"))
    return result
