import { useMemo, useState } from 'react'
import './App.css'
import { formatFrequency, formatMilliseconds, formatWaveformLabel, toWaveformPath } from './audio/display'
import { downloadSound, previewSound } from './audio/runtime'
import { PRESETS, varySoundParams } from './audio/presets'
import { renderSound } from './audio/synthesis'
import { SOUND_LIMITS, type SoundParams, type Waveform } from './audio/types'

const waveformOptions: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth']

type NumericControl = {
  key: Exclude<keyof SoundParams, 'waveform'>
  label: string
  format: (value: number) => string
}

const numericControls: NumericControl[] = [
  { key: 'durationMs', label: 'Duration', format: formatMilliseconds },
  { key: 'startFreq', label: 'Start tone', format: formatFrequency },
  { key: 'endFreq', label: 'End tone', format: formatFrequency },
  { key: 'volume', label: 'Volume', format: (value) => `${Math.round(value * 100)}%` },
  { key: 'noise', label: 'Noise blend', format: (value) => `${Math.round(value * 100)}%` },
  { key: 'attackMs', label: 'Attack', format: formatMilliseconds },
  { key: 'decayMs', label: 'Decay', format: formatMilliseconds },
  { key: 'vibratoDepth', label: 'Vibrato depth', format: formatFrequency },
  { key: 'vibratoRate', label: 'Vibrato rate', format: (value) => `${value.toFixed(1)} Hz` },
  { key: 'lowPassHz', label: 'Low-pass', format: formatFrequency },
  { key: 'transient', label: 'Transient', format: (value) => `${Math.round(value * 100)}%` },
]

const initialPreset = PRESETS[0]

export type AppProps = {
  preview?: (params: SoundParams) => Promise<void> | void
  save?: (params: SoundParams, presetName: string) => void
}

function App({ preview = previewSound, save = downloadSound }: AppProps) {
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id)
  const [params, setParams] = useState<SoundParams>({ ...initialPreset.params })
  const [status, setStatus] = useState('Ready to sketch a tiny UI sound.')

  const selectedPreset = PRESETS.find((preset) => preset.id === selectedPresetId) ?? initialPreset

  const waveformPath = useMemo(() => {
    const samples = renderSound(params, { sampleRate: 6000, seed: 17 })
    return toWaveformPath(samples, 720, 180)
  }, [params])

  function updateParam<K extends keyof SoundParams>(key: K, value: SoundParams[K]) {
    setParams((current) => ({ ...current, [key]: value }))
  }

  function handlePresetSelect(presetId: string) {
    const preset = PRESETS.find((candidate) => candidate.id === presetId)

    if (!preset) {
      return
    }

    setSelectedPresetId(preset.id)
    setParams({ ...preset.params })
    setStatus(`Loaded ${preset.name}.`)
  }

  function handleRandomize() {
    setParams((current) => varySoundParams(current))
    setStatus(`Shook ${selectedPreset.name} into a fresh variation.`)
  }

  function handleReset() {
    setParams({ ...selectedPreset.params })
    setStatus(`Reset ${selectedPreset.name} back to its base shape.`)
  }

  async function handlePreview() {
    try {
      await preview(params)
      setStatus(`Played ${selectedPreset.name}.`)
    } catch {
      setStatus('Audio preview is unavailable in this browser.')
    }
  }

  function handleExport() {
    save(params, selectedPreset.name)
    setStatus(`Downloaded ${selectedPreset.name} as a WAV file.`)
  }

  return (
    <main className="studio-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Tiny UI SFX Studio</p>
          <h1>Design quick clicks, pops, and alerts in under a second.</h1>
          <p className="hero-text">
            Soundmaker generates short interface sounds right in the browser with a procedural
            synth engine, instant preview, and one-click WAV export.
          </p>
        </div>
        <div className="hero-badges" aria-label="Studio highlights">
          <span>50 ms taps</span>
          <span>Preset library</span>
          <span>Wave preview</span>
          <span>WAV export</span>
        </div>
      </section>

      <div className="studio-grid">
        <section className="panel library-panel" aria-labelledby="preset-library-title">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Palette</p>
              <h2 id="preset-library-title">Preset library</h2>
            </div>
            <p className="panel-note">Start from a useful UI sound and tune it fast.</p>
          </div>

          <div className="preset-grid">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-tile ${preset.id === selectedPresetId ? 'is-active' : ''}`}
                aria-pressed={preset.id === selectedPresetId}
                onClick={() => handlePresetSelect(preset.id)}
              >
                <span className="preset-tag">{preset.tag}</span>
                <strong>{preset.name}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>

          <div className="wave-card">
            <div className="wave-copy">
              <p className="panel-kicker">Current preset</p>
              <h3>{selectedPreset.name}</h3>
              <p>{selectedPreset.description}</p>
            </div>

            <svg
              className="wave-graphic"
              viewBox="0 0 720 180"
              role="img"
              aria-label="Waveform preview"
            >
              <defs>
                <linearGradient id="waveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0f766e" />
                  <stop offset="52%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
              <path className="wave-line wave-line--ghost" d="M0 90 L720 90" />
              <path className="wave-line" d={waveformPath} />
            </svg>

            <div className="fact-row" aria-label="Selected sound facts">
              <div>
                <span>Length</span>
                <strong>{formatMilliseconds(params.durationMs)}</strong>
              </div>
              <div>
                <span>Sweep</span>
                <strong>
                  {formatFrequency(params.startFreq)} to {formatFrequency(params.endFreq)}
                </strong>
              </div>
              <div>
                <span>Wave</span>
                <strong>{formatWaveformLabel(params.waveform)}</strong>
              </div>
            </div>
          </div>

          <div className="tip-strip">
            <strong>Shortcut:</strong> keep clicks under 90 ms, hover sounds under 140 ms, and
            success or error feedback around 220-320 ms.
          </div>
        </section>

        <section className="panel controls-panel" aria-labelledby="shape-title">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Shape</p>
              <h2 id="shape-title">Tune the sound</h2>
            </div>
            <p className="panel-note">Every control updates the preview in real time.</p>
          </div>

          <div className="select-wrap">
            <label className="select-label" htmlFor="waveform-select">
              Waveform
            </label>
            <select
              id="waveform-select"
              value={params.waveform}
              onChange={(event) => updateParam('waveform', event.currentTarget.value as Waveform)}
            >
              {waveformOptions.map((waveform) => (
                <option key={waveform} value={waveform}>
                  {formatWaveformLabel(waveform)}
                </option>
              ))}
            </select>
          </div>

          <div className="control-grid">
            {numericControls.map((control) => {
              const limits = SOUND_LIMITS[control.key]
              const value = params[control.key]

              return (
                <label key={control.key} className="control-card">
                  <span className="control-head">
                    <span>{control.label}</span>
                    <strong>{control.format(value)}</strong>
                  </span>
                  <input
                    type="range"
                    min={limits.min}
                    max={limits.max}
                    step={limits.step}
                    value={value}
                    onChange={(event) =>
                      updateParam(control.key, Number(event.currentTarget.value) as SoundParams[typeof control.key])
                    }
                  />
                </label>
              )
            })}
          </div>

          <div className="action-row">
            <button type="button" className="action-button action-button--solid" onClick={handlePreview}>
              Preview sound
            </button>
            <button type="button" className="action-button" onClick={handleRandomize}>
              Randomize
            </button>
            <button type="button" className="action-button" onClick={handleReset}>
              Reset to preset
            </button>
            <button type="button" className="action-button action-button--accent" onClick={handleExport}>
              Export WAV
            </button>
          </div>

          <p className="status-line" role="status" aria-live="polite">
            {status}
          </p>
        </section>
      </div>
    </main>
  )
}

export default App
