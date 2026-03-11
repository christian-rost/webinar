const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleJson(response) {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.detail) message = body.detail
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return response.json()
}

export async function login(username, password) {
  return handleJson(await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }))
}

export async function me(token) {
  return handleJson(await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(token),
  }))
}

export async function getProvider(token) {
  return handleJson(await fetch(`${API_BASE}/api/admin/provider`, {
    headers: authHeaders(token),
  }))
}

export async function updateProvider(token, key_value) {
  return handleJson(await fetch(`${API_BASE}/api/admin/provider`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ key_value }),
  }))
}

export async function runControlling(token, input_json) {
  return handleJson(await fetch(`${API_BASE}/api/controlling/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ input_json }),
  }))
}
