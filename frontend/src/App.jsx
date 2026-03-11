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
        <form className="grid" onSubmit={handleSubmit}>
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
// Controlling Tab
// ---------------------------------------------------------------------------

function ControllingTab({ token }) {
  const [jsonText, setJsonText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileInputRef = useRef(null)

  function loadFile(file) {
    const reader = new FileReader()
    reader.onload = (e) => setJsonText(e.target.result)
    reader.readAsText(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  async function handleRun() {
    setError("")
    setResults(null)
    setProgress({ done: 0, total: 0 })

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
      setProgress({ done: res.total, total: res.total })
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setRunning(false)
    }
  }

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="grid" style={{ gap: "1.25rem" }}>
      <div className="card">
        <div className="card-header">
          <h2>Controlling-Kommentare generieren</h2>
          {results && (
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              {results.succeeded}/{results.total} erfolgreich
            </span>
          )}
        </div>
        <div className="card-body grid">

          {/* Upload area */}
          <div
            className={`upload-area${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            JSON-Datei hier ablegen oder klicken zum Auswählen
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files[0]) loadFile(e.target.files[0]) }}
            />
          </div>

          {/* Text area */}
          <label>
            JSON (direkt einfügen oder über Datei laden)
            <textarea
              className="input"
              style={{ minHeight: 200 }}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{ "Uebergabedaten": [ ... ] }'
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleRun} disabled={running || !jsonText.trim()}>
              {running ? <><span className="spinner" style={{ marginRight: 6 }} />Generiere…</> : "Kommentare generieren"}
            </button>
            {results && (
              <button className="btn btn-outline btn-sm" onClick={() => { setResults(null); setJsonText(""); setProgress({ done: 0, total: 0 }) }}>
                Zurücksetzen
              </button>
            )}
          </div>

          {running && (
            <div>
              <p className="muted" style={{ marginBottom: 4 }}>Verarbeite Services via Mistral…</p>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results && results.results.length > 0 && (
        <div className="results-grid">
          {results.results.map((r, i) => (
            <div key={i} className="result-card">
              <div className="result-card-header">
                <div>
                  <h4>
                    {r.kunde ? `${r.kunde} — ` : ""}{r.servicegruppe} / {r.service}
                  </h4>
                  <span className="result-meta">{r.servicegruppe}</span>
                </div>
                <span className={`badge badge-${r.status === "ok" ? "ok" : "error"}`}>
                  {r.status === "ok" ? "OK" : "Fehler"}
                </span>
              </div>
              <div className="result-card-body">
                {r.status === "ok" ? (
                  <div className="markdown-content">
                    <ReactMarkdown>{r.markdown}</ReactMarkdown>
                  </div>
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
    setError("")
    setNotice("")
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
      <div className="card-header"><h2>Mistral API Key</h2></div>
      <div className="card-body">
        <form className="grid" style={{ maxWidth: 480 }} onSubmit={handleSave}>
          <label>
            API Key
            <input
              className="input"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keyPresent ? "Key vorhanden — nur bei Änderung neu eingeben" : "Mistral API Key eingeben"}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="notice">{notice}</p> : null}
          <div className="actions-row">
            <button className="btn btn-primary" type="submit" disabled={loading || !keyInput.trim()}>
              {loading ? "Speichern…" : "Speichern"}
            </button>
            <span className="muted">Key vorhanden: {keyPresent ? "ja" : "nein"}</span>
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
  { id: "controlling", label: "Controlling" },
  { id: "provider", label: "Provider" },
]

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("access_token") || "")
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [activeTab, setActiveTab] = useState("controlling")

  useEffect(() => {
    if (!token) return
    me(token)
      .then(setCurrentUser)
      .catch(() => {
        localStorage.removeItem("access_token")
        setToken("")
      })
  }, [token])

  async function handleLogin(username, password) {
    setLoading(true)
    setLoginError("")
    try {
      const result = await login(username, password)
      localStorage.setItem("access_token", result.access_token)
      setToken(result.access_token)
      const user = await me(result.access_token)
      setCurrentUser(user)
    } catch (e) {
      setLoginError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token")
    setToken("")
    setCurrentUser(null)
  }

  if (!token) {
    return <LoginView onLogin={handleLogin} loading={loading} error={loginError} />
  }

  return (
    <div className="app-layout">
      <div className="topbar">
        <span className="topbar-brand">XQT5 <span>Webinar Demo</span></span>
        <div className="topbar-user">
          <span>{currentUser?.username || "…"}</span>
          <button className="btn btn-outline btn-sm" style={{ color: "#c9d8ec", borderColor: "#4a6180" }} onClick={handleLogout}>
            Abmelden
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: "visible" }}>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "controlling" && <ControllingTab token={token} />}
      {activeTab === "provider" && <ProviderTab token={token} />}
    </div>
  )
}
