import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { getProvider, login, me, runControlling, updateProvider } from "./api"

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function LoginView({ onLogin, loading, error }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  function handleSubmit(e) {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">
          <h1>XQT5</h1>
          <p>Webinar Demo — KI im Controlling</p>
        </div>
        <form className="grid-1" onSubmit={handleSubmit}>
          <label>
            Benutzername
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </label>
          <label>
            Passwort
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// JSON Upload (shared)
// ---------------------------------------------------------------------------

function JsonUpload({ jsonText, setJsonText }) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  function loadFile(file) {
    const reader = new FileReader()
    reader.onload = (e) => setJsonText(e.target.result)
    reader.readAsText(file)
  }

  return (
    <div className="grid-1">
      <div
        className={`upload-area${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f) }}
        onClick={() => fileInputRef.current?.click()}
      >
        JSON-Datei hier ablegen oder klicken zum Auswählen
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }}
          onChange={(e) => { if (e.target.files[0]) loadFile(e.target.files[0]) }} />
      </div>
      <label>
        JSON (direkt einfügen oder über Datei laden)
        <textarea className="input" value={jsonText} onChange={(e) => setJsonText(e.target.value)}
          placeholder='{ "Uebergabedaten": [ ... ] }' />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Tab
// ---------------------------------------------------------------------------

function parseAmount(str) {
  if (!str) return null
  const m = str.match(/([-+]?\d[\d.,]*)/)
  if (!m) return null
  return parseFloat(m[1].replace(/\./g, "").replace(",", "."))
}

function parsePct(str) {
  if (!str) return 0
  const m = str.match(/([-+]?\d+)/)
  return m ? Math.abs(parseInt(m[1])) : 0
}

function DeviationBar({ pct, positive }) {
  const width = Math.min(parsePct(pct), 100)
  return (
    <div className="bi-bar-track">
      <div className="bi-bar-fill" style={{
        width: `${width}%`,
        background: positive ? "var(--color-danger)" : "var(--color-success)",
      }} />
    </div>
  )
}

function DeviationBadge({ value }) {
  if (!value) return null
  const amount = parseAmount(value)
  const positive = amount > 0
  return (
    <span className={`bi-deviation-badge ${positive ? "bi-deviation-pos" : "bi-deviation-neg"}`}>
      {value}
    </span>
  )
}

function ServiceCard({ kunde, servicegruppe, service }) {
  const tops = service["Top-Überschreitungen (positiv)"] || []
  const flops = service["Top-Unterschreitungen (negativ)"] || []
  const gesamtAmount = parseAmount(service.Gesamtabweichung)
  const gesamtPos = gesamtAmount > 0

  return (
    <div className="bi-service-card">
      <div className="bi-service-header">
        <div className="bi-service-title">
          {kunde && <span className="bi-kunde">{kunde}</span>}
          <span className="bi-sg">{servicegruppe}</span>
          <span className="bi-service-name">{service.Service}</span>
        </div>
        <DeviationBadge value={service.Gesamtabweichung} />
      </div>

      <div className="bi-service-body">
        {tops.length > 0 && (
          <div className="bi-column">
            <div className="bi-column-header bi-column-header-pos">Mehrausgaben</div>
            {tops.map((t, i) => (
              <div key={i} className="bi-row">
                <div className="bi-row-label" title={t.Teilservice}>{t.Teilservice}</div>
                <div className="bi-row-chart">
                  <DeviationBar pct={t.Abweichung} positive={true} />
                  <span className="bi-row-amount bi-amount-pos">{t.Beitrag?.match(/([-+]\d[\d.,]*\s*T€)/)?.[1] || ""}</span>
                </div>
                {t.Fachkommentare?.length > 0 && (
                  <div className="bi-comment">{t.Fachkommentare[0].Kommentare}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {flops.length > 0 && (
          <div className="bi-column">
            <div className="bi-column-header bi-column-header-neg">Minderausgaben</div>
            {flops.map((t, i) => (
              <div key={i} className="bi-row">
                <div className="bi-row-label" title={t.Teilservice}>{t.Teilservice}</div>
                <div className="bi-row-chart">
                  <DeviationBar pct={t.Abweichung} positive={false} />
                  <span className="bi-row-amount bi-amount-neg">{t.Beitrag?.match(/([-+]\d[\d.,]*\s*T€)/)?.[1] || ""}</span>
                </div>
                {t.Fachkommentare?.length > 0 && (
                  <div className="bi-comment">{t.Fachkommentare[0].Kommentare}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tops.length === 0 && flops.length === 0 && (
          <p className="muted-inline" style={{ padding: "0.5rem 0" }}>Keine Top-Abweichungen vorhanden.</p>
        )}
      </div>
    </div>
  )
}

function DashboardTab({ jsonText, setJsonText, onSwitchToKI }) {
  const [error, setError] = useState("")
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!jsonText.trim()) { setData(null); setError(""); return }
    try {
      const parsed = JSON.parse(jsonText)
      setData(parsed)
      setError("")
    } catch {
      setData(null)
      setError("Ungültiges JSON")
    }
  }, [jsonText])

  const block = data?.Uebergabedaten?.[0]
  const vergleich = block?.Vergleich
  const vergleichLabel = vergleich
    ? `${vergleich.Von?.Modus || ""} ${vergleich.Von?.Jahr || ""} vs. ${vergleich.Zu?.Modus || ""} ${vergleich.Zu?.Jahr || ""}`
    : ""

  // Flatten all services for KPI counts
  const allServices = []
  for (const k of block?.Kunden || []) {
    for (const sg of k.Servicegruppen || []) {
      for (const svc of sg.Services || []) {
        allServices.push({ kunde: k.Kunde, servicegruppe: sg.Servicegruppe, service: svc })
      }
    }
  }
  const mehrCount = allServices.filter(s => parseAmount(s.service.Gesamtabweichung) > 0).length
  const minderCount = allServices.filter(s => parseAmount(s.service.Gesamtabweichung) < 0).length

  return (
    <div className="grid-1">
      <div className="card">
        <div className="card-header">
          <h3>Daten</h3>
        </div>
        <div className="card-body grid-1">
          <JsonUpload jsonText={jsonText} setJsonText={setJsonText} />
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>

      {block && (
        <>
          {/* Metadata + KPIs */}
          <div className="bi-meta-bar">
            <div className="bi-meta-item">
              <span className="bi-meta-label">Zeitraum</span>
              <span className="bi-meta-value">Monate {block.betrachtete_Monate}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Vergleich</span>
              <span className="bi-meta-value">{vergleichLabel}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Services gesamt</span>
              <span className="bi-meta-value">{allServices.length}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Mit Mehrausgaben</span>
              <span className="bi-meta-value bi-amount-pos">{mehrCount}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Mit Minderausgaben</span>
              <span className="bi-meta-value bi-amount-neg">{minderCount}</span>
            </div>
          </div>

          {/* Service cards */}
          <div className="grid-1">
            {allServices.map((s, i) => (
              <ServiceCard key={i} kunde={s.kunde} servicegruppe={s.servicegruppe} service={s.service} />
            ))}
          </div>

          {/* CTA */}
          <div className="actions-row">
            <button className="btn btn-primary" onClick={onSwitchToKI}>
              KI-Kommentare generieren →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controlling Tab
// ---------------------------------------------------------------------------

function ControllingTab({ token, jsonText, setJsonText }) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState("")

  async function handleRun() {
    setError("")
    setResults(null)
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setError("Ungültiges JSON – bitte überprüfen.")
      return
    }
    setRunning(true)
    try {
      const res = await runControlling(token, parsed)
      setResults(res)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid-1">
      <div className="card">
        <div className="card-header">
          <h3>KI-Kommentare generieren</h3>
          {results && (
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)" }}>
              {results.succeeded}/{results.total} erfolgreich
            </span>
          )}
        </div>
        <div className="card-body grid-1">
          <JsonUpload jsonText={jsonText} setJsonText={setJsonText} />
          {error ? <p className="error">{error}</p> : null}
          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleRun} disabled={running || !jsonText.trim()}>
              {running ? <><span className="spinner" />Generiere…</> : "Kommentare generieren"}
            </button>
            {results && (
              <button className="btn btn-outline btn-sm" onClick={() => setResults(null)}>
                Zurücksetzen
              </button>
            )}
          </div>
          {running && (
            <div>
              <p className="muted" style={{ marginBottom: 4 }}>Verarbeite Services via Mistral…</p>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: "100%" }} /></div>
            </div>
          )}
        </div>
      </div>

      {results && results.results.length > 0 && (
        <div className="results-grid">
          {results.results.map((r, i) => (
            <div key={i} className="result-card">
              <div className="result-card-header">
                <div>
                  <h4>{r.kunde ? `${r.kunde} — ` : ""}{r.servicegruppe} / {r.service}</h4>
                  <span className="result-meta">{r.servicegruppe}</span>
                </div>
                <span className={`badge badge-${r.status === "ok" ? "ok" : "error"}`}>
                  {r.status === "ok" ? "OK" : "Fehler"}
                </span>
              </div>
              <div className="result-card-body">
                {r.status === "ok" ? (
                  <div className="markdown-content"><ReactMarkdown>{r.markdown}</ReactMarkdown></div>
                ) : (
                  <p className="error">{r.reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Provider Tab
// ---------------------------------------------------------------------------

function ProviderTab({ token }) {
  const [keyPresent, setKeyPresent] = useState(false)
  const [keyInput, setKeyInput] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getProvider(token).then((r) => setKeyPresent(r.key_present)).catch(() => {})
  }, [token])

  async function handleSave(e) {
    e.preventDefault()
    setError(""); setNotice("")
    if (!keyInput.trim()) return
    setLoading(true)
    try {
      const r = await updateProvider(token, keyInput.trim())
      setKeyPresent(r.key_present)
      setKeyInput("")
      setNotice("API Key gespeichert.")
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header"><h3>Mistral API Key</h3></div>
      <div className="card-body">
        <form className="grid-1" style={{ maxWidth: 480 }} onSubmit={handleSave}>
          <label>
            API Key
            <input className="input" type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keyPresent ? "Key vorhanden — nur bei Änderung neu eingeben" : "Mistral API Key eingeben"} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="notice">{notice}</p> : null}
          <div className="actions-row">
            <button className="btn btn-primary" type="submit" disabled={loading || !keyInput.trim()}>
              {loading ? "Speichern…" : "Speichern"}
            </button>
            <span className="muted-inline">Key vorhanden: {keyPresent ? "ja" : "nein"}</span>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "controlling", label: "KI-Analyse" },
  { id: "provider", label: "Provider" },
]

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("access_token") || "")
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [activeTab, setActiveTab] = useState("dashboard")
  const [sharedJson, setSharedJson] = useState("")

  useEffect(() => {
    if (!token) return
    me(token).then(setCurrentUser).catch(() => {
      localStorage.removeItem("access_token")
      setToken("")
    })
  }, [token])

  async function handleLogin(username, password) {
    setLoading(true); setLoginError("")
    try {
      const result = await login(username, password)
      localStorage.setItem("access_token", result.access_token)
      setToken(result.access_token)
      setCurrentUser(await me(result.access_token))
    } catch (e) {
      setLoginError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token")
    setToken(""); setCurrentUser(null)
  }

  if (!token) return <LoginView onLogin={handleLogin} loading={loading} error={loginError} />

  return (
    <div className="app-layout">
      <div className="header">
        <h2>XQT5 Webinar Demo</h2>
        <div className="header-user">
          <span>{currentUser?.username || "…"}</span>
          <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>Abmelden</button>
        </div>
      </div>

      <div className="card" style={{ overflow: "visible" }}>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="admin-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`admin-tab${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <DashboardTab
          jsonText={sharedJson}
          setJsonText={setSharedJson}
          onSwitchToKI={() => setActiveTab("controlling")}
        />
      )}
      {activeTab === "controlling" && (
        <ControllingTab token={token} jsonText={sharedJson} setJsonText={setSharedJson} />
      )}
      {activeTab === "provider" && <ProviderTab token={token} />}
    </div>
  )
}
