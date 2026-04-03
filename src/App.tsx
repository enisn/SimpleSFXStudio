import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  formatFrequency,
  formatMilliseconds,
  formatWaveformLabel,
  toWaveformPath,
} from './audio/display'
import {
  browserPreviewTransport,
  downloadSound,
  type PreviewTransport,
} from './audio/runtime'
import { PRESETS, varySoundParams } from './audio/presets'
import { renderSound } from './audio/synthesis'
import {
  PRESET_CATEGORY_LABELS,
  SOUND_LIMITS,
  type SoundParams,
  type Waveform,
} from './audio/types'
import {
  THEME_MODES,
  THEME_STORAGE_KEY,
  applyThemeMode,
  getStoredThemeMode,
  getThemeMediaQuery,
  type ThemeMode,
} from './theme'

const waveformOptions: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth']
const releasePreviewKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])
const livePreviewDelayMs = 180
const initialPreset = PRESETS[0]
type PresetFilter = 'all' | keyof typeof PRESET_CATEGORY_LABELS

const presetFilterOptions: Array<{ id: PresetFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...(Object.entries(PRESET_CATEGORY_LABELS) as Array<[
    keyof typeof PRESET_CATEGORY_LABELS,
    string,
  ]>).map(([id, label]) => ({ id, label })),
]

type NumericParamKey = Exclude<keyof SoundParams, 'waveform'>

type NumericControl = {
  key: NumericParamKey
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

export type AppProps = {
  previewTransport?: PreviewTransport
  save?: (params: SoundParams, presetName: string) => void
}

function App({ previewTransport = browserPreviewTransport, save = downloadSound }: AppProps) {
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id)
  const [params, setParams] = useState<SoundParams>({ ...initialPreset.params })
  const [status, setStatus] = useState('Pick a preset, then release sliders to hear each tweak.')
  const [isPlaying, setIsPlaying] = useState(false)
  const [livePreview, setLivePreview] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [presetFilter, setPresetFilter] = useState<PresetFilter>('all')
  const [presetSearch, setPresetSearch] = useState('')
  const previewTimerRef = useRef<number | null>(null)
  const playbackTokenRef = useRef(0)
  const paramsRef = useRef(params)

  const selectedPreset = PRESETS.find((preset) => preset.id === selectedPresetId) ?? initialPreset
  const filteredPresets = useMemo(() => {
    const query = presetSearch.trim().toLowerCase()

    return PRESETS.filter((preset) => {
      const matchesCategory = presetFilter === 'all' || preset.category === presetFilter
      const matchesQuery =
        query.length === 0 ||
        `${preset.name} ${preset.description} ${preset.tag} ${PRESET_CATEGORY_LABELS[preset.category]}`
          .toLowerCase()
          .includes(query)

      return matchesCategory && matchesQuery
    })
  }, [presetFilter, presetSearch])
  const presetResultsLabel =
    filteredPresets.length === PRESETS.length
      ? `${PRESETS.length} built-in sounds ready to audition.`
      : `Showing ${filteredPresets.length} of ${PRESETS.length} sounds.`

  const waveformPath = useMemo(() => {
    const samples = renderSound(params, { sampleRate: 6000, seed: 17 })
    return toWaveformPath(samples, 720, 180)
  }, [params])

  useEffect(() => {
    paramsRef.current = params
  }, [params])

  useEffect(() => {
    const mediaQuery = getThemeMediaQuery()
    const syncTheme = () => {
      applyThemeMode(themeMode, mediaQuery)
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    }

    syncTheme()

    if (themeMode !== 'system' || !mediaQuery) {
      return
    }

    const handleThemeChange = () => {
      applyThemeMode(themeMode, mediaQuery)
    }

    mediaQuery.addEventListener('change', handleThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
    }
  }, [themeMode])

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current)
      }

      previewTransport.stop()
    }
  }, [previewTransport])

  const clearScheduledPreview = useCallback(() => {
    if (previewTimerRef.current === null) {
      return
    }

    window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }, [])

  const playParams = useCallback(async (nextParams: SoundParams, presetName: string) => {
    clearScheduledPreview()
    const playbackToken = ++playbackTokenRef.current

    setIsPlaying(true)
    setStatus(`Playing ${presetName}.`)

    try {
      await previewTransport.play(nextParams, {
        onEnded: () => {
          if (playbackTokenRef.current !== playbackToken) {
            return
          }

          setIsPlaying(false)
          setStatus(`Ready to replay ${presetName}.`)
        },
      })
    } catch {
      if (playbackTokenRef.current !== playbackToken) {
        return
      }

      setIsPlaying(false)
      setStatus('Audio preview is unavailable in this browser.')
    }
  }, [clearScheduledPreview, previewTransport])

  const stopPlayback = useCallback((message: string) => {
    clearScheduledPreview()
    playbackTokenRef.current += 1
    previewTransport.stop()
    setIsPlaying(false)
    setStatus(message)
  }, [clearScheduledPreview, previewTransport])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return
      }

      const target = event.target

      if (
        target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)
      ) {
        return
      }

      event.preventDefault()

      if (isPlaying) {
        stopPlayback(`Stopped ${selectedPreset.name}.`)
        return
      }

      void playParams(paramsRef.current, selectedPreset.name)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPlaying, playParams, selectedPreset.name, stopPlayback])

  function commitParams(nextParams: SoundParams) {
    paramsRef.current = nextParams
    setParams(nextParams)
  }

  function scheduleLivePreview(nextParams: SoundParams, presetName = selectedPreset.name) {
    clearScheduledPreview()
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null
      void playParams(nextParams, presetName)
    }, livePreviewDelayMs)
  }

  function updateNumericParam(key: NumericParamKey, value: number) {
    const nextParams = { ...paramsRef.current, [key]: value } as SoundParams
    commitParams(nextParams)

    if (livePreview) {
      scheduleLivePreview(nextParams)
    }
  }

  function handleRangeCommit() {
    clearScheduledPreview()
    void playParams(paramsRef.current, selectedPreset.name)
  }

  function handleWaveformChange(waveform: Waveform) {
    const nextParams = { ...paramsRef.current, waveform }
    commitParams(nextParams)
    void playParams(nextParams, selectedPreset.name)
  }

  function handlePresetSelect(presetId: string) {
    const preset = PRESETS.find((candidate) => candidate.id === presetId)

    if (!preset) {
      return
    }

    setSelectedPresetId(preset.id)
    const nextParams = { ...preset.params }
    commitParams(nextParams)
    void playParams(nextParams, preset.name)
  }

  function handleRandomize() {
    const nextParams = varySoundParams(paramsRef.current)
    commitParams(nextParams)

    if (livePreview || isPlaying) {
      void playParams(nextParams, selectedPreset.name)
      return
    }

    setStatus(`Randomized ${selectedPreset.name}. Release a slider or press Play to hear it.`)
  }

  function handleReset() {
    const nextParams = { ...selectedPreset.params }
    commitParams(nextParams)

    if (livePreview || isPlaying) {
      void playParams(nextParams, selectedPreset.name)
      return
    }

    setStatus(`Reset ${selectedPreset.name}. Press Play when you want a clean replay.`)
  }

  function handleTransportToggle() {
    if (isPlaying) {
      stopPlayback(`Stopped ${selectedPreset.name}.`)
      return
    }

    void playParams(paramsRef.current, selectedPreset.name)
  }

  function handleExport() {
    save(paramsRef.current, selectedPreset.name)
    setStatus(`Downloaded ${selectedPreset.name} as a WAV file.`)
  }

  return (
    <main className="studio-shell">
      <section className="hero-panel">
        <div className="hero-topbar">
          <div className="hero-copy">
            <p className="eyebrow">Tiny UI SFX Studio</p>
            <h1>Sketch quick clicks, pops, and alerts without hunting for the Play button.</h1>
            <p className="hero-text">
              Presets preview on selection, sliders replay on release, and a sticky transport keeps
              playback within reach while you shape the sound.
            </p>
          </div>

          <div className="theme-switcher" aria-label="Theme preference">
            <span className="theme-label">Theme</span>
            <div className="theme-buttons" role="group" aria-label="Theme mode">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`theme-button ${themeMode === mode ? 'is-active' : ''}`}
                  aria-pressed={themeMode === mode}
                  onClick={() => setThemeMode(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-badges" aria-label="Studio highlights">
          <span>Preset auto-play</span>
          <span>Sticky transport</span>
          <span>Release-to-preview</span>
          <span>WAV export</span>
        </div>
      </section>

      <section className="wave-card current-wave-card" aria-labelledby="current-preset-title">
        <button
          type="button"
          className="wave-button current-wave-button"
          data-state={isPlaying ? 'playing' : 'idle'}
          onClick={handleTransportToggle}
          aria-label={isPlaying ? 'Stop current sound' : 'Play current sound'}
        >
          <svg
            className="wave-graphic"
            viewBox="0 0 720 180"
            role="img"
            aria-label="Waveform preview"
          >
            <defs>
              <linearGradient id="waveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0f766e" />
                <stop offset="52%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>
            <path className="wave-line wave-line--ghost" d="M0 90 L720 90" />
            <path className="wave-line" d={waveformPath} />
          </svg>

          <span className="wave-button-label">
            {isPlaying ? 'Stop playback' : 'Tap waveform or press Space'}
          </span>
        </button>

        <div className="current-wave-summary">
          <div className="wave-copy current-wave-copy">
            <p className="panel-kicker">Current preset</p>
            <div className="current-wave-title-row">
              <h2 id="current-preset-title">{selectedPreset.name}</h2>
              <span className={`transport-state current-wave-state ${isPlaying ? 'is-playing' : ''}`}>
                {isPlaying ? 'Playing' : 'Ready'}
              </span>
            </div>
            <p>{selectedPreset.description}</p>
          </div>

          <div className="fact-row current-fact-row" aria-label="Selected sound facts">
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
      </section>

      <div className="studio-grid">
        <section className="panel library-panel" aria-labelledby="preset-library-title">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Palette</p>
              <h2 id="preset-library-title">Preset library</h2>
            </div>
            <p className="panel-note">{presetResultsLabel}</p>
          </div>

          <div className="library-tools">
            <label className="search-wrap" htmlFor="preset-search">
              <span className="search-label">Search presets</span>
              <input
                id="preset-search"
                type="search"
                className="search-input"
                placeholder="Search click, reward, motion..."
                value={presetSearch}
                onChange={(event) => setPresetSearch(event.currentTarget.value)}
              />
            </label>

            <div className="filter-row" role="group" aria-label="Preset categories">
              {presetFilterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`filter-chip ${presetFilter === option.id ? 'is-active' : ''}`}
                  aria-pressed={presetFilter === option.id}
                  onClick={() => setPresetFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="preset-results" aria-label="Preset results">
            {filteredPresets.length > 0 ? (
              <div className="preset-grid">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-tile ${preset.id === selectedPresetId ? 'is-active' : ''}`}
                    aria-pressed={preset.id === selectedPresetId}
                    onClick={() => handlePresetSelect(preset.id)}
                  >
                    <span className="preset-meta">
                      <span className="preset-tag">{preset.tag}</span>
                      <span className="preset-category">{PRESET_CATEGORY_LABELS[preset.category]}</span>
                    </span>
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state" role="status" aria-live="polite">
                No presets match this search yet. Try another keyword or switch back to All.
              </div>
            )}
          </div>
        </section>

        <section className="panel controls-panel" aria-labelledby="shape-title">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Shape</p>
              <h2 id="shape-title">Tune the sound</h2>
            </div>
            <p className="panel-note">
              Release a slider to hear the latest tweak, or turn on Live preview for continuous edits.
            </p>
          </div>

          <div className="select-wrap">
            <div className="select-label">Waveform</div>
            <div className="waveform-grid" role="group" aria-label="Waveform options">
              {waveformOptions.map((waveform) => (
                <button
                  key={waveform}
                  type="button"
                  className={`waveform-chip ${params.waveform === waveform ? 'is-active' : ''}`}
                  aria-pressed={params.waveform === waveform}
                  onClick={() => handleWaveformChange(waveform)}
                >
                  {formatWaveformLabel(waveform)}
                </button>
              ))}
            </div>
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
                    onChange={(event) => updateNumericParam(control.key, Number(event.currentTarget.value))}
                    onPointerUp={handleRangeCommit}
                    onKeyUp={(event) => {
                      if (releasePreviewKeys.has(event.key)) {
                        handleRangeCommit()
                      }
                    }}
                  />
                </label>
              )
            })}
          </div>

          <div className="utility-row">
            <button type="button" className="action-button" onClick={handleRandomize}>
              Randomize
            </button>
            <button type="button" className="action-button" onClick={handleReset}>
              Reset to preset
            </button>
          </div>

          <p className="status-line" role="status" aria-live="polite">
            {status}
          </p>
        </section>
      </div>

      <section className="transport-bar" aria-label="Playback transport">
        <div className="transport-copy">
          <p className="panel-kicker">Transport</p>
          <div className="transport-title-row">
            <h2>{selectedPreset.name}</h2>
            <span className={`transport-state ${isPlaying ? 'is-playing' : ''}`}>
              {isPlaying ? 'Playing' : 'Ready'}
            </span>
          </div>
          <p className="transport-note">
            {formatMilliseconds(params.durationMs)} • {formatWaveformLabel(params.waveform)} •
            preset select auto-plays • sliders preview on release
          </p>
        </div>

        <div className="transport-actions">
          <button
            type="button"
            className="transport-play"
            onClick={handleTransportToggle}
          >
            {isPlaying ? 'Stop sound' : 'Play sound'}
          </button>
          <button
            type="button"
            className={`toggle-pill ${livePreview ? 'is-active' : ''}`}
            aria-pressed={livePreview}
            onClick={() => setLivePreview((current) => !current)}
          >
            <span className="toggle-dot" aria-hidden="true"></span>
            Live preview
          </button>
          <button type="button" className="action-button action-button--accent" onClick={handleExport}>
            Export WAV
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
