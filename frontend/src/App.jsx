import { useEffect, useMemo, useState } from 'react'
import './App.css'

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
    }
  }, [originalUrl])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)

    if (!file) {
      setError('Please choose an image first.')
      return
    }

    const n = Number(numLetters)
    if (!Number.isFinite(n) || n < 1) {
      setError('Number of letters must be 1 or more.')
      return
    }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('num_letters', String(n))
    formData.append('crop', String(crop))

    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/segment`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Request failed')
      }
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
        <h1>Sinhala Word Segmenter</h1>
        <p className="sub">
          Upload an image, enter the expected number of characters, then segment.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Input</h2>
          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span className="label">Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>

            <label className="field">
              <span className="label">Number of letters</span>
              <input
                type="number"
                min={1}
                value={numLetters}
                onChange={(e) => setNumLetters(e.target.value)}
              />
            </label>

            <label className="field checkbox">
              <input
                type="checkbox"
                checked={crop}
                onChange={(e) => setCrop(e.target.checked)}
              />
              <span className="label">Tight crop</span>
            </label>

            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Segmenting…' : 'Segment'}
            </button>

            {error ? <div className="error">{error}</div> : null}
          </form>

          {originalUrl ? (
            <div className="preview">
              <h3>Original</h3>
              <img className="image" src={originalUrl} alt="Uploaded" />
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Output</h2>
          {!result ? (
            <p className="muted">No output yet.</p>
          ) : (
            <>
              <div className="meta">
                <div>
                  <strong>Split points:</strong>{' '}
                  {Array.isArray(result.splits) && result.splits.length
                    ? result.splits.join(', ')
                    : 'none'}
                </div>
              </div>

              <div className="images">
                {result.images?.map((img) => {
                  const hasPred = img.predicted_char != null && img.confidence != null
                  const conf = img.confidence || 0

                  let confColor = '#ef4444' // red
                  if (conf >= 80) confColor = '#22c55e' // green
                  else if (conf >= 50) confColor = '#eab308' // yellow

                  return (
                    <div className="imgCard" key={img.filename}>
                      <div className="imgName">{img.filename}</div>
                      <img
                        className="image"
                        src={`data:image/png;base64,${img.png_base64}`}
                        alt={img.filename}
                      />
                      {hasPred && (
                        <div className="predSection">
                          <div className="predLabel">{img.predicted_char}</div>
                          <div className="confWrapper">
                            <div className="confBar">
                              <div
                                className="confFill"
                                style={{
                                  width: `${conf}%`,
                                  backgroundColor: confColor
                                }}
                              />
                            </div>
                            <div className="confText">{conf.toFixed(1)}%</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
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

export default App
