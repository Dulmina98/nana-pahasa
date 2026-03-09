import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 80) return '#22c55e'
  if (s >= 50) return '#eab308'
  return '#ef4444'
}
function scoreLabel(s) {
  if (s >= 80) return 'Excellent ✅'
  if (s >= 50) return 'Needs Practice ⚠️'
  return 'Keep Trying ❌'
}
function fmt(n) { return typeof n === 'number' ? n.toFixed(1) : '—' }

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 96 }) {
  const r = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <div className="scoreRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2a2a3a" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="scoreText" style={{ color, fontSize: size < 64 ? '0.85rem' : '1.4rem' }}>
        {score.toFixed(0)}
      </div>
    </div>
  )
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfBar({ conf }) {
  const color = scoreColor(conf)
  return (
    <div className="confWrapper">
      <div className="confBar"><div className="confFill" style={{ width: `${conf}%`, backgroundColor: color }} /></div>
      <div className="confText">{conf.toFixed(1)}%</div>
    </div>
  )
}

// ─── Character evaluation card ────────────────────────────────────────────────
function EvalCard({ img }) {
  const hasPred = img.predicted_char != null && img.confidence != null
  const color = scoreColor(img.quality_score)
  return (
    <div className="imgCard evalCard">
      <div className="imgName">{img.filename}</div>
      <img className="charImg" src={`data:image/png;base64,${img.png_base64}`} alt={img.filename} />
      {hasPred && (
        <div className="predSection">
          <div className="predLabel">{img.predicted_char}</div>
          <ConfBar conf={img.confidence} />
        </div>
      )}
      <div className="qualityScore" style={{ color }}>Quality: {img.quality_score.toFixed(0)}/100</div>
      <div className="feedbackBlock">
        <div className="subScoreRow"><span className="subLabel">Line compliance</span><span className="subValue" style={{ color: scoreColor(img.line_compliance) }}>{img.line_compliance.toFixed(0)}%</span></div>
        <div className="subScoreRow"><span className="subLabel">Shape</span><span className="subValue" style={{ color: scoreColor(img.confidence ?? 50) }}>{(img.confidence ?? 50).toFixed(0)}%</span></div>
        <div className="subScoreRow"><span className="subLabel">Proportion</span><span className="subValue" style={{ color: scoreColor(img.proportion_score) }}>{img.proportion_score.toFixed(0)}%</span></div>
        <ul className="feedbackList">{img.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>
      </div>
    </div>
  )
}

// ─── History item card ────────────────────────────────────────────────────────
function HistoryCard({ record }) {
  const [open, setOpen] = useState(false)
  const date = new Date(record.created_at).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const chars = Array.isArray(record.characters) ? record.characters : []
  return (
    <div className="histCard">
      <div className="histTop">
        {record.image_url && (
          <img className="histThumb" src={record.image_url} alt="word" />
        )}
        <div className="histMeta">
          <div className="histDate">{date}</div>
          <div className="histLetters">{record.num_letters} letter{record.num_letters !== 1 ? 's' : ''}</div>
          <div className="histLabel" style={{ color: scoreColor(record.overall_score) }}>
            {scoreLabel(record.overall_score)}
          </div>
        </div>
        <ScoreRing score={record.overall_score} size={64} />
      </div>

      <button className="expandBtn" onClick={() => setOpen(o => !o)}>
        {open ? '▲ Hide details' : '▼ Show character details'}
      </button>

      {open && (
        <div className="histChars">
          {chars.map((ch, i) => (
            <div key={i} className="histCharRow">
              <span className="histCharName">{ch.predicted_char ?? '?'}</span>
              <div className="histCharBars">
                <div className="subScoreRow"><span className="subLabel">Line</span><span className="subValue" style={{ color: scoreColor(ch.line_compliance) }}>{fmt(ch.line_compliance)}%</span></div>
                <div className="subScoreRow"><span className="subLabel">Shape</span><span className="subValue" style={{ color: scoreColor(ch.confidence ?? 50) }}>{fmt(ch.confidence)}%</span></div>
                <div className="subScoreRow"><span className="subLabel">Proportion</span><span className="subValue" style={{ color: scoreColor(ch.proportion_score) }}>{fmt(ch.proportion_score)}%</span></div>
              </div>
              <span className="subValue" style={{ color: scoreColor(ch.quality_score), fontWeight: 700 }}>{fmt(ch.quality_score)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState('evaluate')  // 'evaluate' | 'history'
  const [file, setFile]           = useState(null)
  const [numLetters, setNumLetters] = useState(2)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [result, setResult]       = useState(null)
  const [history, setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(false)

  // preview URL for selected file
  const [previewUrl, setPreviewUrl] = useState(null)
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Load history when history tab is opened
  useEffect(() => {
    if (tab !== 'history') return
    setHistLoading(true)
    fetch(`${API_BASE_URL}/history`)
      .then(r => r.json())
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false))
  }, [tab])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!file) { setError('Please choose an image first.'); return }
    const n = Number(numLetters)
    if (!Number.isFinite(n) || n < 1) { setError('Number of letters must be 1 or more.'); return }

    const fd = new FormData()
    fd.append('image', file)
    fd.append('num_letters', String(n))

    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/evaluate`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Request failed')
      setResult(data)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Nana Piyasa <span className="headerSub">Sinhala Writing Evaluator</span></h1>
        <p className="sub">Upload a handwritten Sinhala word image to evaluate writing quality.</p>
      </header>

      {/* Tab Toggle */}
      <div className="modeToggle">
        <button className={`modeBtn${tab === 'evaluate' ? ' active' : ''}`} onClick={() => setTab('evaluate')}>
          📝 Evaluate Writing
        </button>
        <button className={`modeBtn${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
          📋 History
        </button>
      </div>

      {/* ══ EVALUATE TAB ══════════════════════════════════════════════════════ */}
      {tab === 'evaluate' && (
        <div className="grid">
          {/* Input */}
          <section className="panel">
            <h2>Input</h2>
            <form className="form" onSubmit={onSubmit}>
              <label className="field">
                <span className="label">Image</span>
                <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <label className="field">
                <span className="label">Number of letters</span>
                <input type="number" min={1} value={numLetters} onChange={e => setNumLetters(e.target.value)} />
              </label>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Evaluating…' : 'Evaluate Writing'}
              </button>
              {error && <div className="error">{error}</div>}
            </form>
            {previewUrl && (
              <div className="preview">
                <h3>Uploaded Image</h3>
                <img className="image" src={previewUrl} alt="Uploaded" />
              </div>
            )}
          </section>

          {/* Output */}
          <section className="panel">
            <h2>Output</h2>
            {!result ? (
              <p className="muted">No output yet.</p>
            ) : (
              <>
                <div className="overallBlock">
                  <ScoreRing score={result.overall_score} />
                  <div className="overallInfo">
                    <div className="overallLabel" style={{ color: scoreColor(result.overall_score) }}>
                      {scoreLabel(result.overall_score)}
                    </div>
                    <div className="overallSub">Overall Score: {result.overall_score.toFixed(0)}/100</div>
                    <div className="overallSub muted">Saved to history ✓</div>
                  </div>
                </div>
                <div className="images">
                  {result.images?.map(img => <EvalCard key={img.filename} img={img} />)}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ══ HISTORY TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <section className="panel histPanel">
          <h2>Past Evaluations</h2>
          {histLoading && <p className="muted">Loading…</p>}
          {!histLoading && history.length === 0 && (
            <p className="muted">No evaluations yet. Submit an image to get started.</p>
          )}
          <div className="histList">
            {history.map(r => <HistoryCard key={r.id} record={r} />)}
          </div>
        </section>
      )}

      <footer className="footer">
        API: <code>{API_BASE_URL}</code>
      </footer>
    </div>
  )
}
