from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List

import httpx

from .config import DEMO_MODE, MISTRAL_API_KEY

logger = logging.getLogger(__name__)

# Cache-Datei liegt neben diesem Modul im Ordner "response_cache"
_CACHE_DIR = Path(__file__).parent / "response_cache"
_CACHE_FILE = _CACHE_DIR / "ki_responses.json"


def _load_cache() -> Dict[str, str]:
    try:
        if _CACHE_FILE.exists():
            return json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Cache konnte nicht gelesen werden: %s", exc)
    return {}


def _save_cache(cache: Dict[str, str]) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Cache konnte nicht gespeichert werden: %s", exc)


def _cache_key(item_data: Dict[str, Any]) -> str:
    """Stabiler Hash über die Item-Daten als Cache-Schlüssel."""
    raw = json.dumps(item_data, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_MODEL = "mistral-large-latest"
BATCH_INTERVAL_SECONDS = 3.0

_runtime_api_key: str = ""


def set_runtime_api_key(key: str) -> None:
    global _runtime_api_key
    _runtime_api_key = key.strip()


def get_api_key() -> str:
    return (_runtime_api_key or MISTRAL_API_KEY or "").strip()


SYSTEM_PROMPT = """Du bist ein Mitarbeiter in einer Controlling-Abteilung.
Du erstellst monatlich Kommentare, die bezogen auf den Ist-WiPlan-Vergleich gemacht werden.
Hierfür bekommst Du unterschiedliche Informationen zur Verfügung gestellt, die Du zu einem sinnvollen Text zusammenfasst, der für fachkundige Dritte erstellt wird.
Hierfür bekommst Du unterschiedliche Informationen zur Verfügung gestellt: Betrachtete Monate, Filterung, PSP-Element, Abweichung absolut inkl. Währung, Abweichung in %, Zeitangabe, Kommentar.
Deine Aufgabe ist es diese Teile zusammenzufassen und in einem Fließtext mit entsprechendem Binde-Text zu erstellen.

Ein Beispiel hierfür ist:
Plan-Ist-Kommentierung für AOK NW - Service Arbeitsplatz Für den Kunden AOK NW ergaben sich im Service Arbeitsplatz im Zeitraum von Januar bis Juni 2025 im Vergleich der Ist-Kosten zum Wirtschaftsplan in Summe Minderausgaben von -315 T€. Diese Abweichung setzt sich aus signifikanten Mehrausgaben und noch deutlicheren Minderausgaben zusammen, die im Folgenden detailliert erläutert werden.

Top-Kostenüberschreitungen (Mehrausgaben)
Die wesentlichen Mehrausgaben im Betrachtungszeitraum sind auf folgende Teil-Services zurückzuführen:
Kaufartikel AOK NW: Hier entstanden die größten Mehrausgaben mit +407 T€ (+100%). Ursächlich hierfür ist die geänderte Abrechnung von Lenovo Dockingstations.
AP Infrastruktur AOK NW: In diesem Teil-Service wurden -951 T€ (-57 %) weniger ausgegeben als geplant. Hauptursache hierfür ist der neue VM-Ware-Vertrag, der wesentlich günstiger ist als noch zur Wirtschaftsplanung angenommen.

Dieser Text ist das Ergebnis für folgende Informationen:
Betrachtete Monate: 1-6
Filterung: Ist-Kosten gegenüber dem Wirtschaftsplan
Service: Arbeitsplatz"""


def _build_user_prompt(item_data: Dict[str, Any]) -> str:
    payload = json.dumps([item_data], ensure_ascii=False)
    return (
        f"Das JSON das Dir übergeben wird, ist entsprechend hierarchisch aufgebaut. "
        f"Erstelle eigenständig den Text aus dem JSON in deutsch, das Dir hier übergeben wird: {payload} "
        f"Verwende keine Informationen, die Dir als Beispiel übergeben wurden. "
        f"Baue die Erläuterung selbständig aus dem Dir zur Verfügung gestellten JSON auf.\n"
        f"Erstelle eine Einleitung, die erläutert, was der Inhalt dieses Berichts ist.\n"
        f"Wenn kein Fachkommentar vorhanden ist erwähne NICHT, dass kein Fachkommentar vorhanden ist.\n"
        f"Für die Erläuterung verwende die unter Top-Überschreitungen (positiv) und Top-Unterschreitungen (negativ) "
        f"hinterlegten Informationen. Negative Zahlen bei Top-Unterschreitungen (negativ) bedeuten Minderausgaben. "
        f"Verwende nicht den Begriff Einsparung. Verwende bei allen Zahlen immer die Vorzeichen. "
        f"Positive Zahlen bei Top-Überschreitungen (positiv) bedeuten Mehrausgaben.\n"
        f"Wenn Abweichungen über mehrere Monate gehen, erwähne dieses. "
        f"Wenn es Ausreißer gibt, erwähne diese mit Monat und Betrag. "
        f"Wenn Monate ähnliche Beträge mit gleichen Kommentaren haben, fasse sie zusammen. "
        f"Führe nicht die einzelnen Monate auf!\n"
        f"Die Ausgabe soll im Markdown-Format erfolgen. "
        f"Hebe relevante Informationen hervor. "
        f"Nutze KEINE Trennlinien in Markdown!"
    )


def _call_mistral(api_key: str, user_prompt: str) -> str:
    payload = {
        "model": MISTRAL_MODEL,
        "temperature": 0.7,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=120.0) as client:
        response = client.post(MISTRAL_CHAT_URL, headers=headers, json=payload)
    if response.status_code != 200:
        raise ValueError(f"Mistral API Fehler: HTTP {response.status_code} – {response.text[:300]}")
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("Mistral hat keine Antwort zurückgegeben")
    content = (choices[0].get("message") or {}).get("content") or ""
    content = content.replace("```markdown\n", "").replace("```markdown", "")
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()


def _flatten_service_items(uebergabedaten: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items = []
    for block in uebergabedaten:
        meta = {
            "betrachtete_Monate": block.get("betrachtete_Monate"),
            "Vergleich": block.get("Vergleich"),
        }
        for kunde_obj in block.get("Kunden") or []:
            kunde = kunde_obj.get("Kunde") or ""
            for sg_obj in kunde_obj.get("Servicegruppen") or []:
                sg = sg_obj.get("Servicegruppe") or ""
                for svc_obj in sg_obj.get("Services") or []:
                    svc_name = svc_obj.get("Service") or ""
                    item_data = {
                        **meta,
                        "Kunden": [{"Kunde": kunde, "Servicegruppen": [{"Servicegruppe": sg, "Services": [svc_obj]}]}],
                    }
                    items.append({"kunde": kunde, "servicegruppe": sg, "service": svc_name, "data": item_data})
    return items


def run_controlling(input_json: Dict[str, Any]) -> Dict[str, Any]:
    api_key = get_api_key()
    if not api_key and not DEMO_MODE:
        return {"status": "error", "reason": "Mistral API Key nicht konfiguriert", "results": []}

    uebergabedaten = input_json.get("Uebergabedaten") or []
    if not uebergabedaten:
        return {"status": "error", "reason": "Kein 'Uebergabedaten' Schlüssel im JSON gefunden", "results": []}

    service_items = _flatten_service_items(uebergabedaten)
    if not service_items:
        return {"status": "error", "reason": "Keine Services im JSON gefunden", "results": []}

    cache = _load_cache()
    cache_dirty = False
    results = []
    for idx, item in enumerate(service_items):
        key = _cache_key(item["data"])
        cached_markdown = cache.get(key)

        if DEMO_MODE and cached_markdown:
            # Demo-Modus: immer aus Cache, kein API-Aufruf
            logger.info("DEMO_MODE: Cache-Treffer für %s / %s", item["kunde"], item["service"])
            results.append({
                "status": "ok",
                "kunde": item["kunde"],
                "servicegruppe": item["servicegruppe"],
                "service": item["service"],
                "markdown": cached_markdown,
            })
            continue

        if idx > 0:
            time.sleep(BATCH_INTERVAL_SECONDS)
        try:
            markdown_text = _call_mistral(api_key, _build_user_prompt(item["data"]))
            cache[key] = markdown_text
            cache_dirty = True
            results.append({
                "status": "ok",
                "kunde": item["kunde"],
                "servicegruppe": item["servicegruppe"],
                "service": item["service"],
                "markdown": markdown_text,
            })
        except Exception as exc:
            if cached_markdown:
                # Fallback auf gecachte Antwort bei API-Fehler
                logger.warning("API-Fehler, verwende Cache-Fallback für %s: %s", item["service"], exc)
                results.append({
                    "status": "ok",
                    "kunde": item["kunde"],
                    "servicegruppe": item["servicegruppe"],
                    "service": item["service"],
                    "markdown": cached_markdown,
                })
            else:
                results.append({
                    "status": "error",
                    "kunde": item["kunde"],
                    "servicegruppe": item["servicegruppe"],
                    "service": item["service"],
                    "reason": str(exc),
                    "markdown": "",
                })

    if cache_dirty:
        _save_cache(cache)

    ok_count = sum(1 for r in results if r["status"] == "ok")
    return {
        "status": "ok",
        "total": len(results),
        "succeeded": ok_count,
        "failed": len(results) - ok_count,
        "results": results,
    }
