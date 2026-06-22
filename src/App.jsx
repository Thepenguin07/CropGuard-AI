import { useState, useRef, useCallback } from 'react'
import { predict, loadModel } from './model.js'
import { speakHindi, buildHindiUtterance } from './tts.js'
import treatments from './treatments.json'
function getSeverity(treatmentEntry) {
  const sev = treatmentEntry?.severity || 'green'
  const map = {
    red:    { color: '#E05252', label: 'High Risk',  emoji: '🔴' },
    yellow: { color: '#E09A2B', label: 'Medium Risk', emoji: '🟡' },
    green:  { color: '#4CAF7D', label: 'Low Risk',   emoji: '🟢' },
  }
  return map[sev] || map.green
}
function formatClassName(key) {
  if (!key) return ''
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function App() {
  const [phase, setPhase]           = useState('idle')
  const [modelReady, setModelReady] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [preview, setPreview]       = useState(null)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)
  const fileInputRef                = useRef(null)

  useState(() => {
    loadModel((p) => setLoadProgress(Math.round(p * 100)))
      .then(() => setModelReady(true))
      .catch(console.error)
  })

  const handleCapture = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    setPhase('loading')
    setResult(null)
    setError(null)
    try {
      const img = new Image()
      img.src = url
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
      const prediction = await predict(img)
      const treatment  = treatments[prediction.classKey] || null
      const severity   = getSeverity(treatment)
      setResult({ ...prediction, severity, treatment })
      setPhase('result')
      if (treatment) speakHindi(buildHindiUtterance(treatment))
    } catch (err) {
      console.error(err)
      setError('Analysis failed. Please try again with a clearer photo.')
      setPhase('error')
    }
  }, [])

  const reset = () => {
    setPhase('idle')
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logo}>🌿 CropGuard</span>
          <span style={styles.badge}>
            {modelReady ? '● AI Ready' : `Loading ${loadProgress}%`}
          </span>
        </div>
      </header>

      <main style={styles.main}>

        {phase === 'idle' && (
          <div style={styles.idleWrap}>
            <div style={styles.heroText}>
              <h1 style={styles.h1}>Diagnose your crop</h1>
              <p style={styles.sub}>
                Point your camera at a diseased leaf.<br />
                Get an instant diagnosis in Hindi — no internet needed.
              </p>
            </div>
            <button
              style={{ ...styles.captureBtn, opacity: modelReady ? 1 : 0.6 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={!modelReady}
            >
              <span style={styles.captureBtnIcon}>📷</span>
              <span>{modelReady ? 'Take Photo' : `Loading AI… ${loadProgress}%`}</span>
            </button>
            <div style={styles.cropGrid}>
              {['🌾 Wheat', '🌾 Rice', '🍅 Tomato', '🥔 Potato', '🌽 Maize'].map(c => (
                <span key={c} style={styles.cropChip}>{c}</span>
              ))}
            </div>
            <p style={styles.offlineNote}>100% offline · No login · Works on 2G</p>
          </div>
        )}

        {phase === 'loading' && (
          <div style={styles.centered}>
            {preview && <img src={preview} style={styles.previewImg} alt="Captured leaf" />}
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Analysing leaf…</p>
          </div>
        )}

        {phase === 'result' && result && (
          <div style={styles.resultWrap}>
            {preview && <img src={preview} style={styles.previewImg} alt="Analysed leaf" />}

            <div style={{ ...styles.severityCard, borderColor: result.severity.color }}>
              <div style={styles.severityRow}>
                <span style={styles.severityEmoji}>{result.severity.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.severityLabel, color: result.severity.color }}>
                    {result.severity.label}
                  </div>
                  <div style={styles.diseaseNameLarge}>
                    {result.treatment?.label_en || formatClassName(result.classKey)}
                  </div>
                </div>
                <div style={styles.confidencePill}>
                  {Math.round(result.confidence * 100)}%
                </div>
              </div>
              <div style={styles.barTrack}>
                <div style={{
                  ...styles.barFill,
                  width: `${Math.round(result.confidence * 100)}%`,
                  background: result.severity.color,
                }} />
              </div>
              {result.confidence < 0.75 && (
                <p style={styles.lowConfWarning}>
                  ⚠️ Low confidence — ensure only the diseased leaf fills the frame
                </p>
              )}
            </div>

            {result.treatment && (
              <div style={styles.treatmentCard}>
                <h2 style={styles.treatmentTitle}>Recommended Action</h2>
                <p style={styles.adviceText}>{result.treatment.advice_en}</p>
                <div style={styles.hindiBox}>
                  <p style={styles.hindiText}>{result.treatment.advice_hi}</p>
                  <button
                    style={styles.ttsBtn}
                    onClick={() => speakHindi(buildHindiUtterance(result.treatment))}
                  >
                    🔊 हिंदी में सुनें
                  </button>
                </div>
              </div>
            )}

            <button style={styles.resetBtn} onClick={reset}>
              📷 Scan Another Leaf
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div style={styles.centered}>
            <p style={styles.errorText}>⚠️ {error}</p>
            <button style={styles.resetBtn} onClick={reset}>Try Again</button>
          </div>
        )}

      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleCapture}
      />
    </div>
  )
}

const styles = {
  root: { minHeight: '100dvh', background: '#0F1F0F', color: '#E8F0E8', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' },
  header: { background: '#162416', borderBottom: '1px solid #2A3D2A', padding: '12px 20px', position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { maxWidth: 480, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 20, fontWeight: 700, color: '#7EC850', letterSpacing: '-0.5px' },
  badge: { fontSize: 12, color: '#7EC850', background: '#1E3A1E', padding: '4px 10px', borderRadius: 20, border: '1px solid #2E5A2E' },
  main: { flex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '24px 20px' },
  idleWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 32 },
  heroText: { textAlign: 'center' },
  h1: { fontSize: 32, fontWeight: 800, color: '#E8F0E8', margin: '0 0 10px', letterSpacing: '-1px', lineHeight: 1.1 },
  sub: { fontSize: 16, color: '#9AB89A', margin: 0, lineHeight: 1.6 },
  captureBtn: { display: 'flex', alignItems: 'center', gap: 12, background: '#7EC850', color: '#0F1F0F', border: 'none', borderRadius: 16, padding: '18px 36px', fontSize: 18, fontWeight: 700, cursor: 'pointer', width: '100%', justifyContent: 'center' },
  captureBtnIcon: { fontSize: 24 },
  cropGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cropChip: { background: '#1E3A1E', border: '1px solid #2E5A2E', borderRadius: 20, padding: '6px 14px', fontSize: 13, color: '#9AB89A' },
  offlineNote: { fontSize: 12, color: '#5A7A5A', margin: 0 },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 40 },
  previewImg: { width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 16, border: '2px solid #2A3D2A' },
  spinner: { width: 48, height: 48, border: '4px solid #2A3D2A', borderTop: '4px solid #7EC850', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#9AB89A', fontSize: 16 },
  resultWrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  severityCard: { background: '#162416', border: '2px solid', borderRadius: 16, padding: '20px' },
  severityRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  severityEmoji: { fontSize: 36 },
  severityLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  diseaseNameLarge: { fontSize: 20, fontWeight: 700, color: '#E8F0E8', marginTop: 2 },
  confidencePill: { background: '#0F1F0F', borderRadius: 12, padding: '8px 14px', fontSize: 22, fontWeight: 800, color: '#E8F0E8' },
  barTrack: { height: 6, background: '#2A3D2A', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6, transition: 'width 0.6s ease' },
  lowConfWarning: { color: '#E09A2B', fontSize: 13, marginTop: 10, textAlign: 'center' },
  treatmentCard: { background: '#162416', border: '1px solid #2A3D2A', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 },
  treatmentTitle: { fontSize: 16, fontWeight: 700, color: '#7EC850', margin: 0 },
  adviceText: { fontSize: 14, color: '#C8D8C8', lineHeight: 1.6, margin: 0 },
  hindiBox: { background: '#1A2E1A', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 },
  hindiText: { fontSize: 15, color: '#E8F0E8', lineHeight: 1.7, margin: 0 },
  ttsBtn: { background: '#1E3A1E', border: '1px solid #2E5A2E', borderRadius: 10, padding: '10px', color: '#7EC850', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  resetBtn: { background: 'transparent', border: '1px solid #2A3D2A', borderRadius: 12, padding: '14px', color: '#9AB89A', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' },
  errorText: { color: '#E05252', fontSize: 15, textAlign: 'center' },
}

const s = document.createElement('style')
s.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
document.head.appendChild(s)