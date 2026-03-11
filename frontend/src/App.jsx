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
// Tab 1: Daten
// ---------------------------------------------------------------------------

function DatenTab({ jsonText, setJsonText }) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  function loadFile(file) {
    const reader = new FileReader()
    reader.onload = (e) => setJsonText(e.target.result)
    reader.readAsText(file)
  }

  let preview = null
  if (jsonText.trim()) {
    try {
      const parsed = JSON.parse(jsonText)
      const block = parsed?.Uebergabedaten?.[0]
      if (block) {
        let serviceCount = 0
        let kundenCount = 0
        for (const k of block.Kunden || []) {
          kundenCount++
          for (const sg of k.Servicegruppen || [])
            serviceCount += (sg.Services || []).length
        }
        preview = { monate: block.betrachtete_Monate, kunden: kundenCount, services: serviceCount }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="card">
      <div className="card-header"><h3>JSON-Daten laden</h3></div>
      <div className="card-body grid-1">
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

        {preview && (
          <div className="bi-meta-bar">
            <div className="bi-meta-item">
              <span className="bi-meta-label">Zeitraum</span>
              <span className="bi-meta-value">Monate {preview.monate}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Kunden / Bereiche</span>
              <span className="bi-meta-value">{preview.kunden}</span>
            </div>
            <div className="bi-meta-item">
              <span className="bi-meta-label">Services</span>
              <span className="bi-meta-value">{preview.services}</span>
            </div>
          </div>
        )}

        {jsonText.trim() && !preview && (
          <p className="error">Ungültiges JSON – bitte überprüfen.</p>
        )}

        <div className="actions-row">
          {jsonText && (
            <button className="btn btn-outline btn-sm" onClick={() => setJsonText("")}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2: Dashboard
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
  const positive = parseAmount(value) > 0
  return (
    <span className={`bi-deviation-badge ${positive ? "bi-deviation-pos" : "bi-deviation-neg"}`}>
      {value}
    </span>
  )
}

function ServiceCard({ kunde, servicegruppe, service, comment, showComments }) {
  const tops = service["Top-Überschreitungen (positiv)"] || []
  const flops = service["Top-Unterschreitungen (negativ)"] || []

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
                {showComments && t.Fachkommentare?.length > 0 && (
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
                {showComments && t.Fachkommentare?.length > 0 && (
                  <div className="bi-comment">{t.Fachkommentare[0].Kommentare}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tops.length === 0 && flops.length === 0 && (
          <div className="bi-column" style={{ gridColumn: "1/-1" }}>
            <p className="muted-inline">Keine Top-Abweichungen vorhanden.</p>
          </div>
        )}
      </div>

      {showComments && comment && (
        <div className="bi-comment-panel">
          <div className="bi-comment-panel-header">KI-Kommentar</div>
          <div className="markdown-content">
            <ReactMarkdown>{comment.markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardTab({ jsonText, kiResults, onSwitchToKI }) {
  const [showComments, setShowComments] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!jsonText.trim()) { setData(null); setError(""); return }
    try { setData(JSON.parse(jsonText)); setError("") }
    catch { setData(null); setError("Ungültiges JSON") }
  }, [jsonText])

  if (!jsonText.trim()) {
    return (
      <div className="card">
        <div className="card-header"><h3>Dashboard</h3></div>
        <div className="card-body">
          <p className="muted">Bitte zuerst im Tab <strong>Daten</strong> eine JSON-Datei laden.</p>
        </div>
      </div>
    )
  }

  if (error) return <div className="card"><div className="card-body"><p className="error">{error}</p></div></div>

  const block = data?.Uebergabedaten?.[0]
  if (!block) return null

  const vergleich = block.Vergleich
  const vergleichLabel = vergleich
    ? `${vergleich.Von?.Modus || ""} ${vergleich.Von?.Jahr || ""} vs. ${vergleich.Zu?.Modus || ""} ${vergleich.Zu?.Jahr || ""}`
    : ""

  const allServices = []
  for (const k of block.Kunden || [])
    for (const sg of k.Servicegruppen || [])
      for (const svc of sg.Services || [])
        allServices.push({ kunde: k.Kunde, servicegruppe: sg.Servicegruppe, service: svc })

  const mehrCount = allServices.filter(s => parseAmount(s.service.Gesamtabweichung) > 0).length
  const minderCount = allServices.filter(s => parseAmount(s.service.Gesamtabweichung) < 0).length

  function findComment(s) {
    if (!kiResults?.results) return null
    return kiResults.results.find(r =>
      r.status === "ok" &&
      r.service === s.service.Service &&
      r.servicegruppe === s.servicegruppe &&
      r.kunde === (s.kunde || "")
    ) || null
  }

  const hasComments = kiResults?.results?.some(r => r.status === "ok")

  return (
    <div className="grid-1">
      {/* Metadata */}
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
          <span className="bi-meta-label">Mehrausgaben</span>
          <span className="bi-meta-value bi-amount-pos">{mehrCount}</span>
        </div>
        <div className="bi-meta-item">
          <span className="bi-meta-label">Minderausgaben</span>
          <span className="bi-meta-value bi-amount-neg">{minderCount}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-row">
        <button className="btn btn-outline btn-sm" onClick={() => setShowComments(v => !v)}>
          {showComments ? "Kommentare ausblenden" : "Kommentare einblenden"}
        </button>
        {!hasComments && (
          <button className="btn btn-primary btn-sm" onClick={onSwitchToKI}>
            KI-Kommentare generieren →
          </button>
        )}
      </div>

      {/* Service cards */}
      <div className="grid-1">
        {allServices.map((s, i) => (
          <ServiceCard
            key={i}
            kunde={s.kunde}
            servicegruppe={s.servicegruppe}
            service={s.service}
            comment={findComment(s)}
            showComments={showComments}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3: KI-Analyse
// ---------------------------------------------------------------------------

function KIAnalyseTab({ token, jsonText, kiResults, setKiResults, kiLoading, setKiLoading }) {
  const [error, setError] = useState("")

  async function handleRun() {
    if (!jsonText.trim()) return
    setError(""); setKiResults(null)
    let parsed
    try { parsed = JSON.parse(jsonText) }
    catch { setError("Ungültiges JSON – bitte im Tab Daten prüfen."); return }
    setKiLoading(true)
    try {
      const res = await runControlling(token, parsed)
      setKiResults(res)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setKiLoading(false)
    }
  }

  if (!jsonText.trim()) {
    return (
      <div className="card">
        <div className="card-header"><h3>KI-Analyse</h3></div>
        <div className="card-body">
          <p className="muted">Bitte zuerst im Tab <strong>Daten</strong> eine JSON-Datei laden.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid-1">
      <div className="card">
        <div className="card-header">
          <h3>KI-Analyse</h3>
          {kiResults && (
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)" }}>
              {kiResults.succeeded}/{kiResults.total} erfolgreich
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleRun} disabled={kiLoading}>
              {kiLoading ? <><span className="spinner" />Kommentare werden generiert…</> : kiResults ? "Neu generieren" : "Kommentare generieren"}
            </button>
            {kiResults && (
              <button className="btn btn-outline btn-sm" onClick={() => setKiResults(null)}>
                Zurücksetzen
              </button>
            )}
          </div>
          {error ? <p className="error" style={{ marginTop: "0.75rem" }}>{error}</p> : null}
        </div>
      </div>

      {kiResults?.results?.length > 0 && (
        <div className="results-grid">
          {kiResults.results.map((r, i) => (
            <div key={i} className="result-card">
              <div className="result-card-header">
                <div>
                  <h4>{r.kunde ? `${r.kunde} — ` : ""}{r.servicegruppe} / {r.service}</h4>
                </div>
                <span className={`badge badge-${r.status === "ok" ? "ok" : "error"}`}>
                  {r.status === "ok" ? "OK" : "Fehler"}
                </span>
              </div>
              <div className="result-card-body">
                {r.status === "ok"
                  ? <div className="markdown-content"><ReactMarkdown>{r.markdown}</ReactMarkdown></div>
                  : <p className="error">{r.reason}</p>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4: Provider
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
  { id: "daten",      label: "Daten" },
  { id: "dashboard",  label: "Dashboard" },
  { id: "ki-analyse", label: "KI-Analyse" },
  { id: "provider",   label: "Provider" },
]

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("access_token") || "")
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [activeTab, setActiveTab] = useState("daten")

  // Shared state — persists across tab switches
  const [sharedJson, setSharedJson] = useState("")
  const [kiResults, setKiResults] = useState(null)
  const [kiLoading, setKiLoading] = useState(false)

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

      {activeTab === "daten"      && <DatenTab jsonText={sharedJson} setJsonText={setSharedJson} />}
      {activeTab === "dashboard"  && <DashboardTab jsonText={sharedJson} kiResults={kiResults} onSwitchToKI={() => setActiveTab("ki-analyse")} />}
      {activeTab === "ki-analyse" && <KIAnalyseTab token={token} jsonText={sharedJson} kiResults={kiResults} setKiResults={setKiResults} kiLoading={kiLoading} setKiLoading={setKiLoading} />}
      {activeTab === "provider"   && <ProviderTab token={token} />}
    </div>
  )
}
