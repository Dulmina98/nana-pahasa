import { useEffect, useState } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── helpers ────────────────────────────────────────────────────── */
const scoreColor = s => s >= 80 ? '#22c55e' : s >= 50 ? '#eab308' : '#ef4444'
const scoreLabel = s => s >= 80 ? 'Excellent' : s >= 50 ? 'Needs Practice' : 'Keep Trying'
const scoreEmoji = s => s >= 80 ? '✅' : s >= 50 ? '⚠️' : '❌'
const fmt = n => typeof n === 'number' ? n.toFixed(1) : '—'

/* ── Score Ring ─────────────────────────────────────────────────── */
function ScoreRing({ score, size = 96 }) {
  const r = size / 2 - 8
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <div className="scoreRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#23233a" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.9s ease' }} />
      </svg>
      <div className="scoreText" style={{ color, fontSize: size < 72 ? '0.8rem' : '1.35rem' }}>
        {score.toFixed(0)}
      </div>
    </div>
  )
}

/* ── Confidence Bar ─────────────────────────────────────────────── */
function Bar({ val }) {
  return (
    <div className="bar">
      <div className="barFill" style={{ width: `${val}%`, background: scoreColor(val) }} />
    </div>
  )
}

/* ── Char Card (evaluate result) ────────────────────────────────── */
function CharCard({ c }) {
  const col = scoreColor(c.quality_score)
  return (
    <div className="charCard">
      <img className="charImg" src={`data:image/png;base64,${c.png_base64}`} alt={c.filename} />
      {c.predicted_char && (
        <div className="charGlyph" style={{ color: col }}>{c.predicted_char}</div>
      )}
      <div className="charScore" style={{ color: col }}>{c.quality_score.toFixed(0)}<span>/100</span></div>
      <div className="charRows">
        <div className="charRow"><span>Line</span><Bar val={c.line_compliance} /><b style={{ color: scoreColor(c.line_compliance) }}>{fmt(c.line_compliance)}%</b></div>
        <div className="charRow"><span>Shape</span><Bar val={c.confidence ?? 50} /><b style={{ color: scoreColor(c.confidence ?? 50) }}>{fmt(c.confidence)}%</b></div>
        <div className="charRow"><span>Size</span><Bar val={c.proportion_score} /><b style={{ color: scoreColor(c.proportion_score) }}>{fmt(c.proportion_score)}%</b></div>
      </div>
      <ul className="charFeedback">
        {c.feedback.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
    </div>
  )
}

/* ── History Card ───────────────────────────────────────────────── */
function HistCard({ r }) {
  const [open, setOpen] = useState(false)
  const date = new Date(r.created_at).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  const chars = Array.isArray(r.characters) ? r.characters : []
  return (
    <div className="histCard">
      <div className="histTop">
        {r.image_url && <img className="histThumb" src={r.image_url} alt="word" />}
        <div className="histMeta">
          <div className="histDate">{date}</div>
          <div className="histLetters">{r.num_letters} letter{r.num_letters !== 1 ? 's' : ''}</div>
          <div style={{ color: scoreColor(r.overall_score), fontWeight: 700, fontSize: '0.95rem' }}>
            {scoreEmoji(r.overall_score)} {scoreLabel(r.overall_score)}
          </div>
        </div>
        <ScoreRing score={r.overall_score} size={60} />
      </div>
      <button className="expandBtn" onClick={() => setOpen(o => !o)}>
        {open ? '▲ Hide details' : '▼ Character details'}
      </button>
      {open && (
        <div className="histChars">
          {chars.map((c, i) => (
            <div className="histCharRow" key={i}>
              <span className="histGlyph">{c.predicted_char ?? '?'}</span>
              <div className="histCharBars">
                <div className="charRow"><span>Line</span><Bar val={c.line_compliance} /><b style={{ color: scoreColor(c.line_compliance) }}>{fmt(c.line_compliance)}%</b></div>
                <div className="charRow"><span>Shape</span><Bar val={c.confidence ?? 50} /><b style={{ color: scoreColor(c.confidence ?? 50) }}>{fmt(c.confidence)}%</b></div>
                <div className="charRow"><span>Size</span><Bar val={c.proportion_score} /><b style={{ color: scoreColor(c.proportion_score) }}>{fmt(c.proportion_score)}%</b></div>
              </div>
              <div className="histCharScore" style={{ color: scoreColor(c.quality_score) }}>{fmt(c.quality_score)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main App ───────────────────────────────────────────────────── */
export default function App() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [numLetters, setNum] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [histBusy, setHistBusy] = useState(true)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const loadHistory = () => {
    setHistBusy(true)
    fetch(`${API}/history`)
      .then(r => r.json())
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(() => { })
      .finally(() => setHistBusy(false))
  }

  useEffect(() => { loadHistory() }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setResult(null)
    if (!file) { setError('Please choose an image first.'); return }
    const n = Number(numLetters)
    if (!Number.isFinite(n) || n < 1) { setError('Number of letters must be ≥ 1.'); return }
    const fd = new FormData()
    fd.append('image', file)
    fd.append('num_letters', String(n))
    setBusy(true)
    try {
      const res = await fetch(`${API}/evaluate`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Request failed')
      setResult(data)
      loadHistory()              // refresh history after save
    } catch (err) {
      setError(err?.message || String(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="appContainer">
      <div className="root">

        {/* ── HERO ───────────────────────────────────────────────── */}
        <header className="hero">
          <div className="heroBadge">AI-Powered · Sinhala Script · For Children</div>
          <h1 className="heroTitle">Nana Piyasa</h1>
          <p className="heroSub">
            Upload a handwritten Sinhala word image and instantly receive an AI score on
            line compliance, character shape, and proportion — all designed to help children
            write better.
          </p>
          <div className="heroPills">
            <span className="pill">📏 Ruled-line detection</span>
            <span className="pill">🤖 ConvNeXt AI model</span>
            <span className="pill">💾 Saved to cloud</span>
            <span className="pill">📋 Full history</span>
          </div>
        </header>

        {/* ── HOW IT WORKS ───────────────────────────────────────── */}
        <section className="howSection">
          <h2 className="sectionTitle">How it works</h2>
          <div className="howGrid">
            <div className="howCard">
              <div className="howNum">1</div>
              <div className="howIcon">📸</div>
              <div className="howLabel">Upload</div>
              <p className="howDesc">Take a photo of the child's handwritten word on a double-lined notebook page and upload it.</p>
            </div>
            <div className="howCard">
              <div className="howNum">2</div>
              <div className="howIcon">✂️</div>
              <div className="howLabel">Segment</div>
              <p className="howDesc">The AI automatically segments the word into individual characters using vertical projection.</p>
            </div>
            <div className="howCard">
              <div className="howNum">3</div>
              <div className="howIcon">🧠</div>
              <div className="howLabel">Evaluate</div>
              <p className="howDesc">Each character is scored on line compliance, shape quality, and proportion against reference images.</p>
            </div>
            <div className="howCard">
              <div className="howNum">4</div>
              <div className="howIcon">📊</div>
              <div className="howLabel">Review</div>
              <p className="howDesc">Scores, feedback, and the original image are saved to the cloud so you can track progress over time.</p>
            </div>
          </div>
        </section>

        {/* ── EVALUATE ───────────────────────────────────────────── */}
        <section className="evalSection">
          <h2 className="sectionTitle">Evaluate Writing</h2>
          <div className="evalGrid">

            {/* Form */}
            <div className="card formCard">
              <h3 className="cardTitle">Upload Image</h3>
              <form onSubmit={onSubmit} className="form">
                <label className="dropZone" htmlFor="imgInput">
                  {preview
                    ? <img className="dropPreview" src={preview} alt="preview" />
                    : <><div className="dropIcon">🖼️</div><div className="dropText">Click to choose image</div><div className="dropHint">PNG · JPG · JPEG</div></>
                  }
                  <input id="imgInput" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                </label>

                <label className="field">
                  <span className="fieldLabel">Number of letters in the word</span>
                  <input type="number" min={1} max={20} value={numLetters}
                    onChange={e => setNum(e.target.value)} className="numInput" />
                </label>

                <button className="submitBtn" type="submit" disabled={busy}>
                  {busy
                    ? <><span className="spinner" />Evaluating…</>
                    : '✦ Evaluate Writing'}
                </button>
                {error && <div className="errBox">{error}</div>}
              </form>
            </div>

            {/* Result */}
            <div className="card resultCard">
              <h3 className="cardTitle">Results</h3>
              {!result ? (
                <div className="emptyState">
                  <div className="emptyIcon">📝</div>
                  <p>Submit an image to see the evaluation results here.</p>
                </div>
              ) : (
                <>
                  {/* Overall */}
                  <div className="overallBar">
                    <ScoreRing score={result.overall_score} />
                    <div className="overallInfo">
                      <div className="overallLabel" style={{ color: scoreColor(result.overall_score) }}>
                        {scoreEmoji(result.overall_score)} {scoreLabel(result.overall_score)}
                      </div>
                      <div className="overallScore">Overall: {result.overall_score.toFixed(0)} / 100</div>
                      <div className="overallSaved">✓ Saved to history</div>
                    </div>
                  </div>
                  {/* Characters */}
                  <div className="charGrid">
                    {result.images?.map(c => <CharCard key={c.filename} c={c} />)}
                  </div>
                </>
              )}
            </div>

          </div>
        </section>

        {/* ── HISTORY ────────────────────────────────────────────── */}
        <section className="histSection">
          <div className="histHeader">
            <h2 className="sectionTitle" style={{ marginBottom: 0 }}>Evaluation History</h2>
            <button className="refreshBtn" onClick={loadHistory}>↻ Refresh</button>
          </div>

          {histBusy && <p className="muted">Loading…</p>}
          {!histBusy && history.length === 0 && (
            <div className="emptyState">
              <div className="emptyIcon">🗂️</div>
              <p>No evaluations yet. Submit your first image above!</p>
            </div>
          )}
          {!histBusy && history.length > 0 && (
            <>
              <div className="statRow">
                <div className="stat"><div className="statNum">{history.length}</div><div className="statLabel">Total submissions</div></div>
                <div className="stat"><div className="statNum" style={{ color: scoreColor(history[0].overall_score) }}>{history[0].overall_score.toFixed(0)}</div><div className="statLabel">Latest score</div></div>
                <div className="stat"><div className="statNum" style={{ color: '#a78bfa' }}>{(history.reduce((a, r) => a + r.overall_score, 0) / history.length).toFixed(0)}</div><div className="statLabel">Average score</div></div>
                <div className="stat"><div className="statNum" style={{ color: '#22c55e' }}>{history.filter(r => r.overall_score >= 80).length}</div><div className="statLabel">Excellent results</div></div>
              </div>
              <div className="histList">
                {history.map(r => <HistCard key={r.id} r={r} />)}
              </div>
            </>
          )}
        </section>

        <footer className="footer">
          <span>Nana Piyasa — Sinhala Handwriting Evaluator</span>
          <span className="footerDot">·</span>
          <span>FYP Project</span>
        </footer>
      </div>
    </div>
  )
}
