import { useEffect, useMemo, useState } from 'react'
import './App.css'

// ─── Score colour helper ──────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return '#22c55e'   // green
  if (score >= 50) return '#eab308'   // yellow
  return '#ef4444'                    // red
}

function scoreLabel(score) {
  if (score >= 80) return 'Excellent'
  if (score >= 50) return 'Needs Practice'
  return 'Keep Trying'
}

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <div className="scoreRing">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#2a2a3a" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="scoreText" style={{ color }}>{score.toFixed(0)}</div>
    </div>
  )
}

// ─── Confidence bar (shared) ──────────────────────────────────────────────────
function ConfBar({ conf }) {
  const color = scoreColor(conf)
  return (
    <div className="confWrapper">
      <div className="confBar">
        <div className="confFill" style={{ width: `${conf}%`, backgroundColor: color }} />
      </div>
      <div className="confText">{conf.toFixed(1)}%</div>
    </div>
  )
}

// ─── Character card for SEGMENT mode ─────────────────────────────────────────
function SegmentCard({ img }) {
  const hasPred = img.predicted_char != null && img.confidence != null
  return (
    <div className="imgCard">
      <div className="imgName">{img.filename}</div>
      <img className="image" src={`data:image/png;base64,${img.png_base64}`} alt={img.filename} />
      {hasPred && (
        <div className="predSection">
          <div className="predLabel">{img.predicted_char}</div>
          <ConfBar conf={img.confidence} />
        </div>
      )}
    </div>
  )
}

// ─── Character card for EVALUATE mode ────────────────────────────────────────
function EvalCard({ img }) {
  const hasPred = img.predicted_char != null && img.confidence != null
  const color = scoreColor(img.quality_score)
  return (
    <div className="imgCard evalCard">
      <div className="imgName">{img.filename}</div>
      <img className="image" src={`data:image/png;base64,${img.png_base64}`} alt={img.filename} />

      {hasPred && (
        <div className="predSection">
          <div className="predLabel">{img.predicted_char}</div>
          <ConfBar conf={img.confidence} />
        </div>
      )}

      <div className="qualityScore" style={{ color }}>
        Quality: {img.quality_score.toFixed(0)}/100
      </div>

      <div className="feedbackBlock">
        <div className="subScoreRow">
          <span className="subLabel">Line compliance</span>
          <span className="subValue" style={{ color: scoreColor(img.line_compliance) }}>
            {img.line_compliance.toFixed(0)}%
          </span>
        </div>
        <div className="subScoreRow">
          <span className="subLabel">Shape</span>
          <span className="subValue" style={{ color: scoreColor(img.confidence ?? 50) }}>
            {(img.confidence ?? 50).toFixed(0)}%
          </span>
        </div>
        <div className="subScoreRow">
          <span className="subLabel">Proportion</span>
          <span className="subValue" style={{ color: scoreColor(img.proportion_score) }}>
            {img.proportion_score.toFixed(0)}%
          </span>
        </div>

        <ul className="feedbackList">
          {img.feedback.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const [mode, setMode] = useState('segment')   // 'segment' | 'evaluate'
  const [file, setFile] = useState(null)
  const [numLetters, setNumLetters] = useState(2)
  const [crop, setCrop] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const originalUrl = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl) }, [originalUrl])

  // Reset result when switching mode
  useEffect(() => { setResult(null); setError('') }, [mode])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!file) { setError('Please choose an image first.'); return }
    const n = Number(numLetters)
    if (!Number.isFinite(n) || n < 1) { setError('Number of letters must be 1 or more.'); return }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('num_letters', String(n))
    if (mode === 'segment') formData.append('crop', String(crop))

    const endpoint = mode === 'segment' ? '/segment' : '/evaluate'
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Request failed')
      setResult(data)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const isEval = mode === 'evaluate'

  return (
    <div className="page">
      <header className="header">
        <h1>නාන පියස <span className="headerSub">Sinhala Writing Tool</span></h1>
        <p className="sub">Upload a handwritten Sinhala word image to segment characters or evaluate writing quality.</p>
      </header>

      {/* Mode Toggle */}
      <div className="modeToggle">
        <button
          className={`modeBtn${mode === 'segment' ? ' active' : ''}`}
          onClick={() => setMode('segment')}
        >
          ✂️ Segment
        </button>
        <button
          className={`modeBtn${mode === 'evaluate' ? ' active' : ''}`}
          onClick={() => setMode('evaluate')}
        >
          📝 Evaluate Writing
        </button>
      </div>

      <div className="grid">
        {/* ── Input Panel ── */}
        <section className="panel">
          <h2>Input</h2>
          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span className="label">Image</span>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>

            <label className="field">
              <span className="label">Number of letters</span>
              <input type="number" min={1} value={numLetters} onChange={(e) => setNumLetters(e.target.value)} />
            </label>

            {!isEval && (
              <label className="field checkbox">
                <input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} />
                <span className="label">Tight crop</span>
              </label>
            )}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? (isEval ? 'Evaluating…' : 'Segmenting…') : (isEval ? 'Evaluate Writing' : 'Segment')}
            </button>

            {error ? <div className="error">{error}</div> : null}
          </form>

          {originalUrl && (
            <div className="preview">
              <h3>Uploaded Image</h3>
              <img className="image" src={originalUrl} alt="Uploaded" />
            </div>
          )}
        </section>

        {/* ── Output Panel ── */}
        <section className="panel">
          <h2>Output</h2>

          {!result ? (
            <p className="muted">No output yet.</p>
          ) : isEval ? (
            /* ═══ EVALUATE mode output ═══ */
            <>
              <div className="overallBlock">
                <ScoreRing score={result.overall_score} />
                <div className="overallInfo">
                  <div className="overallLabel" style={{ color: scoreColor(result.overall_score) }}>
                    {scoreLabel(result.overall_score)}
                  </div>
                  <div className="overallSub">Overall Score: {result.overall_score.toFixed(0)}/100</div>
                  <div className="overallSub muted">
                    Split points: {result.splits?.length ? result.splits.join(', ') : 'none'}
                  </div>
                </div>
              </div>
              <div className="images">
                {result.images?.map((img) => <EvalCard key={img.filename} img={img} />)}
              </div>
            </>
          ) : (
            /* ═══ SEGMENT mode output ═══ */
            <>
              <div className="meta">
                <div>
                  <strong>Split points:</strong>{' '}
                  {Array.isArray(result.splits) && result.splits.length ? result.splits.join(', ') : 'none'}
                </div>
              </div>
              <div className="images">
                {result.images?.map((img) => <SegmentCard key={img.filename} img={img} />)}
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="footer">
        API: <code>{API_BASE_URL}</code>
      </footer>
    </div>
  )
}
