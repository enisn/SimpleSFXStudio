import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './StudioPage.css'
import {
  formatFrequency,
  formatMilliseconds,
  formatWaveformLabel,
  toWaveformPath,
} from '../audio/display'
import { PRESETS } from '../audio/presets'
import { getSimplePresetById, simplePresetToStudioPatch } from '../audio/studio/adapters'
import { STUDIO_PATCHES } from '../audio/studio/presets'
import { mixStereoForDisplay, renderStudioPatch } from '../audio/studio/synthesis'
import {
  browserStudioPreviewTransport,
  downloadStudioPatch,
  type StudioPreviewTransport,
} from '../audio/studio/runtime'
import {
  MAX_STUDIO_LAYERS,
  STUDIO_DRAFT_STORAGE_KEY,
  STUDIO_LIMITS,
  clampStudioPatch,
  cloneStudioPatch,
  createStudioLayer,
  varyStudioLayer,
  type StudioFilterType,
  type StudioLayer,
  type StudioMasterSettings,
  type StudioPatch,
} from '../audio/studio/types'
import {
  THEME_MODES,
  THEME_STORAGE_KEY,
  applyThemeMode,
  getStoredThemeMode,
  getThemeMediaQuery,
  type ThemeMode,
} from '../theme'

const filterTypes: StudioFilterType[] = ['none', 'lowpass', 'highpass', 'bandpass']
const waveformOptions = ['sine', 'triangle', 'square', 'sawtooth'] as const
const livePreviewDelayMs = 180
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
const STUDIO_LAYOUT_STORAGE_KEY = 'soundmaker-studio-layout'
const DEFAULT_LEFT_PANEL_WIDTH = 320
const DEFAULT_RIGHT_PANEL_WIDTH = 380
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 460
const MIN_CENTER_WIDTH = 540

type LayerNumericKey =
  | 'gain'
  | 'pan'
  | 'noise'
  | 'startFreq'
  | 'endFreq'
  | 'detuneCents'
  | 'startMs'
  | 'durationMs'
  | 'vibratoDepth'
  | 'vibratoRate'
  | 'transient'

type EnvelopeNumericKey = keyof StudioLayer['envelope']
type FilterNumericKey = Exclude<keyof StudioLayer['filter'], 'type'>
type MasterNumericKey = keyof StudioMasterSettings
type LeftSidebarTab = 'layers' | 'browser'
type InspectorTab = 'layer' | 'envelope' | 'filter' | 'master'
type ResizePane = 'left' | 'right'

type SliderConfig<Key extends string> = {
  key: Key
  label: string
  min: number
  max: number
  step: number
  format: (value: number) => string
}

type ResizeState = {
  pane: ResizePane
  startX: number
  startWidth: number
}

type WorkspaceStyle = CSSProperties & {
  '--studio-left-width': string
  '--studio-right-width': string
}

const layerControlConfigs: Array<SliderConfig<LayerNumericKey>> = [
  {
    key: 'gain',
    label: 'Layer gain',
    min: STUDIO_LIMITS.layerGain.min,
    max: STUDIO_LIMITS.layerGain.max,
    step: STUDIO_LIMITS.layerGain.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'pan',
    label: 'Pan',
    min: STUDIO_LIMITS.pan.min,
    max: STUDIO_LIMITS.pan.max,
    step: STUDIO_LIMITS.pan.step,
    format: (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}`,
  },
  {
    key: 'noise',
    label: 'Noise mix',
    min: STUDIO_LIMITS.noise.min,
    max: STUDIO_LIMITS.noise.max,
    step: STUDIO_LIMITS.noise.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'startFreq',
    label: 'Start pitch',
    min: STUDIO_LIMITS.frequency.min,
    max: STUDIO_LIMITS.frequency.max,
    step: STUDIO_LIMITS.frequency.step,
    format: formatFrequency,
  },
  {
    key: 'endFreq',
    label: 'End pitch',
    min: STUDIO_LIMITS.frequency.min,
    max: STUDIO_LIMITS.frequency.max,
    step: STUDIO_LIMITS.frequency.step,
    format: formatFrequency,
  },
  {
    key: 'detuneCents',
    label: 'Detune',
    min: STUDIO_LIMITS.detuneCents.min,
    max: STUDIO_LIMITS.detuneCents.max,
    step: STUDIO_LIMITS.detuneCents.step,
    format: (value) => `${Math.round(value)} cents`,
  },
  {
    key: 'startMs',
    label: 'Start offset',
    min: STUDIO_LIMITS.layerStartMs.min,
    max: STUDIO_LIMITS.layerStartMs.max,
    step: STUDIO_LIMITS.layerStartMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'durationMs',
    label: 'Layer duration',
    min: STUDIO_LIMITS.layerDurationMs.min,
    max: STUDIO_LIMITS.layerDurationMs.max,
    step: STUDIO_LIMITS.layerDurationMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'vibratoDepth',
    label: 'Vibrato depth',
    min: STUDIO_LIMITS.vibratoDepth.min,
    max: STUDIO_LIMITS.vibratoDepth.max,
    step: STUDIO_LIMITS.vibratoDepth.step,
    format: formatFrequency,
  },
  {
    key: 'vibratoRate',
    label: 'Vibrato rate',
    min: STUDIO_LIMITS.vibratoRate.min,
    max: STUDIO_LIMITS.vibratoRate.max,
    step: STUDIO_LIMITS.vibratoRate.step,
    format: (value) => `${value.toFixed(1)} Hz`,
  },
  {
    key: 'transient',
    label: 'Transient',
    min: STUDIO_LIMITS.transient.min,
    max: STUDIO_LIMITS.transient.max,
    step: STUDIO_LIMITS.transient.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
]

const envelopeControlConfigs: Array<SliderConfig<EnvelopeNumericKey>> = [
  {
    key: 'attackMs',
    label: 'Attack',
    min: STUDIO_LIMITS.attackMs.min,
    max: STUDIO_LIMITS.attackMs.max,
    step: STUDIO_LIMITS.attackMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'holdMs',
    label: 'Hold',
    min: STUDIO_LIMITS.holdMs.min,
    max: STUDIO_LIMITS.holdMs.max,
    step: STUDIO_LIMITS.holdMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'decayMs',
    label: 'Decay',
    min: STUDIO_LIMITS.decayMs.min,
    max: STUDIO_LIMITS.decayMs.max,
    step: STUDIO_LIMITS.decayMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'sustain',
    label: 'Sustain',
    min: STUDIO_LIMITS.sustain.min,
    max: STUDIO_LIMITS.sustain.max,
    step: STUDIO_LIMITS.sustain.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'releaseMs',
    label: 'Release',
    min: STUDIO_LIMITS.releaseMs.min,
    max: STUDIO_LIMITS.releaseMs.max,
    step: STUDIO_LIMITS.releaseMs.step,
    format: formatMilliseconds,
  },
]

const filterControlConfigs: Array<SliderConfig<FilterNumericKey>> = [
  {
    key: 'cutoffHz',
    label: 'Cutoff',
    min: STUDIO_LIMITS.cutoffHz.min,
    max: STUDIO_LIMITS.cutoffHz.max,
    step: STUDIO_LIMITS.cutoffHz.step,
    format: formatFrequency,
  },
  {
    key: 'resonance',
    label: 'Resonance',
    min: STUDIO_LIMITS.resonance.min,
    max: STUDIO_LIMITS.resonance.max,
    step: STUDIO_LIMITS.resonance.step,
    format: (value) => value.toFixed(1),
  },
  {
    key: 'envelopeAmount',
    label: 'Env amount',
    min: STUDIO_LIMITS.envelopeAmount.min,
    max: STUDIO_LIMITS.envelopeAmount.max,
    step: STUDIO_LIMITS.envelopeAmount.step,
    format: (value) => `${value.toFixed(1)} oct`,
  },
]

const masterControlConfigs: Array<SliderConfig<MasterNumericKey>> = [
  {
    key: 'gain',
    label: 'Master gain',
    min: STUDIO_LIMITS.masterGain.min,
    max: STUDIO_LIMITS.masterGain.max,
    step: STUDIO_LIMITS.masterGain.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'drive',
    label: 'Drive',
    min: STUDIO_LIMITS.drive.min,
    max: STUDIO_LIMITS.drive.max,
    step: STUDIO_LIMITS.drive.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'delayMix',
    label: 'Delay mix',
    min: STUDIO_LIMITS.delayMix.min,
    max: STUDIO_LIMITS.delayMix.max,
    step: STUDIO_LIMITS.delayMix.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'delayMs',
    label: 'Delay time',
    min: STUDIO_LIMITS.delayMs.min,
    max: STUDIO_LIMITS.delayMs.max,
    step: STUDIO_LIMITS.delayMs.step,
    format: formatMilliseconds,
  },
  {
    key: 'delayFeedback',
    label: 'Feedback',
    min: STUDIO_LIMITS.delayFeedback.min,
    max: STUDIO_LIMITS.delayFeedback.max,
    step: STUDIO_LIMITS.delayFeedback.step,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'stereoWidth',
    label: 'Stereo width',
    min: STUDIO_LIMITS.stereoWidth.min,
    max: STUDIO_LIMITS.stereoWidth.max,
    step: STUDIO_LIMITS.stereoWidth.step,
    format: (value) => `${value.toFixed(2)}x`,
  },
]

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getStoredStudioPatch() {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY)

  if (!stored) {
    return null
  }

  try {
    return clampStudioPatch(JSON.parse(stored) as StudioPatch)
  } catch {
    return null
  }
}

function getStoredStudioLayout() {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(STUDIO_LAYOUT_STORAGE_KEY)

  if (!stored) {
    return null
  }

  try {
    const parsed = JSON.parse(stored) as { leftPanelWidth?: number; rightPanelWidth?: number }

    return {
      leftPanelWidth: clampPanelWidth(
        parsed.leftPanelWidth ?? DEFAULT_LEFT_PANEL_WIDTH,
        MIN_SIDEBAR_WIDTH,
        MAX_SIDEBAR_WIDTH,
      ),
      rightPanelWidth: clampPanelWidth(
        parsed.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH,
        MIN_SIDEBAR_WIDTH,
        MAX_SIDEBAR_WIDTH,
      ),
    }
  } catch {
    return null
  }
}

function createLayerId() {
  return `layer-${Math.random().toString(36).slice(2, 8)}`
}

export type StudioPageProps = {
  previewTransport?: StudioPreviewTransport
  save?: (patch: StudioPatch) => void
}

function StudioPage({
  previewTransport = browserStudioPreviewTransport,
  save = downloadStudioPatch,
}: StudioPageProps) {
  const [searchParams] = useSearchParams()
  const importedPreset = getSimplePresetById(searchParams.get('preset'))
  const initialPatch = useMemo(
    () =>
      importedPreset
        ? simplePresetToStudioPatch(importedPreset)
        : getStoredStudioPatch() ?? cloneStudioPatch(STUDIO_PATCHES[0]),
    [importedPreset],
  )
  const initialLayout = useMemo(() => getStoredStudioLayout(), [])
  const [patch, setPatch] = useState<StudioPatch>(initialPatch)
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(initialPatch.id)
  const [selectedLayerId, setSelectedLayerId] = useState<string>(initialPatch.layers[0]?.id ?? 'layer-1')
  const [status, setStatus] = useState(
    importedPreset
      ? `Imported ${importedPreset.name} from the landing page into the advanced studio.`
      : 'Advanced studio ready. Drag pane dividers, switch tabs, and audition without page scrolling.',
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [livePreview, setLivePreview] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [leftSidebarTab, setLeftSidebarTab] = useState<LeftSidebarTab>('layers')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layer')
  const [leftPanelWidth, setLeftPanelWidth] = useState(
    initialLayout?.leftPanelWidth ?? DEFAULT_LEFT_PANEL_WIDTH,
  )
  const [rightPanelWidth, setRightPanelWidth] = useState(
    initialLayout?.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH,
  )
  const previewTimerRef = useRef<number | null>(null)
  const playbackTokenRef = useRef(0)
  const patchRef = useRef(patch)
  const panelWidthsRef = useRef({ left: leftPanelWidth, right: rightPanelWidth })
  const resizeStateRef = useRef<ResizeState | null>(null)

  const activeLayerId = patch.layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : (patch.layers[0]?.id ?? 'layer-1')
  const selectedLayer = patch.layers.find((layer) => layer.id === activeLayerId) ?? patch.layers[0]
  const availableSources = useMemo(
    () => [
      ...STUDIO_PATCHES.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        source: 'studio' as const,
      })),
      ...PRESETS.map((preset) => ({
        id: `simple-${preset.id}`,
        name: `${preset.name} -> Studio`,
        description: preset.description,
        source: 'simple' as const,
      })),
    ],
    [],
  )
  const waveformPath = useMemo(() => {
    const render = renderStudioPatch(patch, { sampleRate: 6000, seed: 17 })
    return toWaveformPath(mixStereoForDisplay(render), 960, 300)
  }, [patch])
  const workspaceStyle = useMemo<WorkspaceStyle>(
    () => ({
      '--studio-left-width': `${leftPanelWidth}px`,
      '--studio-right-width': `${rightPanelWidth}px`,
    }),
    [leftPanelWidth, rightPanelWidth],
  )

  useEffect(() => {
    patchRef.current = patch
    window.localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(patch))
  }, [patch])

  useEffect(() => {
    panelWidthsRef.current = { left: leftPanelWidth, right: rightPanelWidth }
    window.localStorage.setItem(
      STUDIO_LAYOUT_STORAGE_KEY,
      JSON.stringify({ leftPanelWidth, rightPanelWidth }),
    )
  }, [leftPanelWidth, rightPanelWidth])

  useEffect(() => {
    document.body.dataset.studio = 'true'

    return () => {
      delete document.body.dataset.studio
      delete document.body.dataset.resizing
    }
  }, [])

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
    return () => mediaQuery.removeEventListener('change', handleThemeChange)
  }, [themeMode])

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current)
      }

      previewTransport.stop()
    }
  }, [previewTransport])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current

      if (!resizeState) {
        return
      }

      const widths = panelWidthsRef.current
      const availableSpace = window.innerWidth - MIN_CENTER_WIDTH - 96

      if (resizeState.pane === 'left') {
        const maxWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, availableSpace - widths.right),
        )
        setLeftPanelWidth(
          clampPanelWidth(
            resizeState.startWidth + (event.clientX - resizeState.startX),
            MIN_SIDEBAR_WIDTH,
            maxWidth,
          ),
        )
        return
      }

      const maxWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, availableSpace - widths.left),
      )
      setRightPanelWidth(
        clampPanelWidth(
          resizeState.startWidth - (event.clientX - resizeState.startX),
          MIN_SIDEBAR_WIDTH,
          maxWidth,
        ),
      )
    }

    const handlePointerUp = () => {
      resizeStateRef.current = null
      delete document.body.dataset.resizing
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const clearScheduledPreview = useCallback(() => {
    if (previewTimerRef.current === null) {
      return
    }

    window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }, [])

  const playPatch = useCallback(async (nextPatch: StudioPatch, message: string) => {
    clearScheduledPreview()
    const playbackToken = ++playbackTokenRef.current
    setIsPlaying(true)
    setStatus(message)

    try {
      await previewTransport.play(nextPatch, {
        onEnded: () => {
          if (playbackTokenRef.current !== playbackToken) {
            return
          }

          setIsPlaying(false)
          setStatus(`Ready to replay ${nextPatch.name}.`)
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

  const handleRangeCommit = useCallback(() => {
    clearScheduledPreview()
    void playPatch(patchRef.current, `Previewing ${patchRef.current.name}.`)
  }, [clearScheduledPreview, playPatch])

  const handleRangeCommitKey = useCallback((key: string) => {
    if (releasePreviewKeys.has(key)) {
      handleRangeCommit()
    }
  }, [handleRangeCommit])

  const beginResize = useCallback(
    (pane: ResizePane) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      resizeStateRef.current = {
        pane,
        startX: event.clientX,
        startWidth: pane === 'left' ? panelWidthsRef.current.left : panelWidthsRef.current.right,
      }
      document.body.dataset.resizing = pane
    },
    [],
  )

  function commitPatch(nextPatch: StudioPatch, options: { preview?: boolean; status?: string } = {}) {
    const normalizedPatch = clampStudioPatch(nextPatch)
    patchRef.current = normalizedPatch
    setPatch(normalizedPatch)

    if (options.status) {
      setStatus(options.status)
    }

    if (options.preview && (livePreview || isPlaying)) {
      clearScheduledPreview()
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null
        void playPatch(normalizedPatch, `Previewing ${normalizedPatch.name}.`)
      }, livePreviewDelayMs)
    }
  }

  function handlePatchSourceSelect(sourceId: string, sourceType: 'studio' | 'simple') {
    if (sourceType === 'simple') {
      const presetId = sourceId.replace(/^simple-/, '')
      const preset = PRESETS.find((candidate) => candidate.id === presetId)

      if (!preset) {
        return
      }

      const nextPatch = simplePresetToStudioPatch(preset)
      setSelectedLibraryId(nextPatch.id)
      setSelectedLayerId(nextPatch.layers[0]?.id ?? 'layer-1')
      setLeftSidebarTab('layers')
      setInspectorTab('layer')
      commitPatch(nextPatch, { status: `Imported ${preset.name} into the studio.` })
      return
    }

    const preset = STUDIO_PATCHES.find((candidate) => candidate.id === sourceId)

    if (!preset) {
      return
    }

    const nextPatch = cloneStudioPatch(preset)
    setSelectedLibraryId(preset.id)
    setSelectedLayerId(nextPatch.layers[0]?.id ?? 'layer-1')
    setLeftSidebarTab('layers')
    commitPatch(nextPatch, { status: `Loaded ${preset.name}.` })
  }

  function updatePatchName(name: string) {
    commitPatch(
      { ...patchRef.current, name },
      { status: `Renamed patch to ${name || 'Untitled Patch'}.` },
    )
  }

  function updateMasterValue(key: MasterNumericKey, value: number) {
    commitPatch(
      {
        ...patchRef.current,
        master: { ...patchRef.current.master, [key]: value },
      } as StudioPatch,
      { preview: true },
    )
  }

  function updatePatchDuration(durationMs: number) {
    commitPatch({ ...patchRef.current, durationMs }, { preview: true })
  }

  function updateSelectedLayer(
    updater: (layer: StudioLayer) => StudioLayer,
    options: { preview?: boolean; status?: string } = {},
  ) {
    const currentLayer = patchRef.current.layers.find((layer) => layer.id === activeLayerId)

    if (!currentLayer) {
      return
    }

    const nextPatch = {
      ...patchRef.current,
      layers: patchRef.current.layers.map((layer) => (layer.id === activeLayerId ? updater(layer) : layer)),
    }

    commitPatch(nextPatch, options)
  }

  function updateLayerValue(key: LayerNumericKey, value: number) {
    updateSelectedLayer((layer) => ({ ...layer, [key]: value }), { preview: true })
  }

  function updateEnvelopeValue(key: EnvelopeNumericKey, value: number) {
    updateSelectedLayer(
      (layer) => ({
        ...layer,
        envelope: { ...layer.envelope, [key]: value },
      }),
      { preview: true },
    )
  }

  function updateFilterValue(key: FilterNumericKey, value: number) {
    updateSelectedLayer(
      (layer) => ({
        ...layer,
        filter: { ...layer.filter, [key]: value },
      }),
      { preview: true },
    )
  }

  function handleWaveformChange(waveform: StudioLayer['waveform']) {
    updateSelectedLayer((layer) => ({ ...layer, waveform }), { preview: true })
  }

  function handleFilterTypeChange(type: StudioFilterType) {
    updateSelectedLayer((layer) => ({ ...layer, filter: { ...layer.filter, type } }), {
      preview: true,
    })
  }

  function handleLayerNameChange(name: string) {
    updateSelectedLayer((layer) => ({ ...layer, name }), {
      status: `Updated ${name || 'layer'} name.`,
    })
  }

  function handlePlayToggle() {
    if (isPlaying) {
      stopPlayback(`Stopped ${patch.name}.`)
      return
    }

    void playPatch(patchRef.current, `Playing ${patchRef.current.name}.`)
  }

  function handleExport() {
    save(patchRef.current)
    setStatus(`Downloaded ${patchRef.current.name} as a stereo WAV file.`)
  }

  function handleAddLayer() {
    if (patchRef.current.layers.length >= MAX_STUDIO_LAYERS) {
      setStatus(`This MVP keeps patches to ${MAX_STUDIO_LAYERS} layers.`)
      return
    }

    const nextLayer = createStudioLayer(
      createLayerId(),
      `Layer ${patchRef.current.layers.length + 1}`,
      {
        startMs: Math.min(patchRef.current.durationMs - 40, patchRef.current.layers.length * 28),
      },
    )
    const nextPatch = { ...patchRef.current, layers: [...patchRef.current.layers, nextLayer] }

    setSelectedLayerId(nextLayer.id)
    setLeftSidebarTab('layers')
    setInspectorTab('layer')
    commitPatch(nextPatch, { status: `Added ${nextLayer.name}.` })
  }

  function handleDuplicateLayer() {
    if (!selectedLayer || patchRef.current.layers.length >= MAX_STUDIO_LAYERS) {
      return
    }

    const duplicate = createStudioLayer(createLayerId(), `${selectedLayer.name} Copy`, {
      ...selectedLayer,
      id: createLayerId(),
      name: `${selectedLayer.name} Copy`,
      pan: Math.max(-1, Math.min(1, selectedLayer.pan * -1 || 0.18)),
      detuneCents: selectedLayer.detuneCents + 12,
      startMs: selectedLayer.startMs + 12,
    })
    const nextPatch = { ...patchRef.current, layers: [...patchRef.current.layers, duplicate] }

    setSelectedLayerId(duplicate.id)
    setLeftSidebarTab('layers')
    setInspectorTab('layer')
    commitPatch(nextPatch, { status: `Duplicated ${selectedLayer.name}.` })
  }

  function handleRemoveLayer(layerId = activeLayerId) {
    const layerToRemove = patchRef.current.layers.find((layer) => layer.id === layerId)

    if (!layerToRemove || patchRef.current.layers.length === 1) {
      setStatus('A patch needs at least one layer.')
      return
    }

    const removedIndex = patchRef.current.layers.findIndex((layer) => layer.id === layerId)
    const nextLayers = patchRef.current.layers.filter((layer) => layer.id !== layerId)
    const fallbackLayer = nextLayers[Math.min(removedIndex, nextLayers.length - 1)] ?? nextLayers[0]

    if (layerId === activeLayerId) {
      setSelectedLayerId(fallbackLayer?.id ?? 'layer-1')
    }

    commitPatch(
      { ...patchRef.current, layers: nextLayers },
      { status: `Removed ${layerToRemove.name}.` },
    )
  }

  function handleMoveLayer(direction: -1 | 1) {
    if (!selectedLayer) {
      return
    }

    const currentIndex = patchRef.current.layers.findIndex((layer) => layer.id === selectedLayer.id)
    const targetIndex = currentIndex + direction

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= patchRef.current.layers.length) {
      return
    }

    const nextLayers = [...patchRef.current.layers]
    const [movedLayer] = nextLayers.splice(currentIndex, 1)
    nextLayers.splice(targetIndex, 0, movedLayer)
    commitPatch({ ...patchRef.current, layers: nextLayers }, { status: `Reordered ${selectedLayer.name}.` })
  }

  function toggleLayerEnabled(layerId: string) {
    const layer = patchRef.current.layers.find((candidate) => candidate.id === layerId)

    if (!layer) {
      return
    }

    commitPatch(
      {
        ...patchRef.current,
        layers: patchRef.current.layers.map((candidate) =>
          candidate.id === layerId ? { ...candidate, enabled: !candidate.enabled } : candidate,
        ),
      },
      { status: `${layer.enabled ? 'Muted' : 'Enabled'} ${layer.name}.`, preview: true },
    )
  }

  function toggleLayerSolo(layerId: string) {
    const layer = patchRef.current.layers.find((candidate) => candidate.id === layerId)

    if (!layer) {
      return
    }

    commitPatch(
      {
        ...patchRef.current,
        layers: patchRef.current.layers.map((candidate) =>
          candidate.id === layerId ? { ...candidate, solo: !candidate.solo } : candidate,
        ),
      },
      { status: `${layer.solo ? 'Released solo on' : 'Soloed'} ${layer.name}.`, preview: true },
    )
  }

  function handleRandomizeSelectedLayer() {
    if (!selectedLayer) {
      return
    }

    updateSelectedLayer((layer) => varyStudioLayer(layer), {
      status: `Randomized ${selectedLayer.name}.`,
      preview: true,
    })
  }

  return (
    <main className="studio-page-shell">
      <section className="studio-topbar">
        <div className="studio-topbar__start">
          <Link to="/" className="studio-link studio-link--ghost">
            Back to landing
          </Link>
          <div className="studio-patch-title">
            <label htmlFor="studio-patch-name">Patch</label>
            <input
              id="studio-patch-name"
              className="studio-name-input"
              value={patch.name}
              onChange={(event) => updatePatchName(event.currentTarget.value)}
            />
          </div>
        </div>

        <div className="studio-topbar__actions">
          <button type="button" className="studio-toolbar-button" onClick={handlePlayToggle}>
            {isPlaying ? 'Stop patch' : 'Play patch'}
          </button>
          <button
            type="button"
            className="studio-toolbar-button"
            onClick={handleRandomizeSelectedLayer}
          >
            Randomize layer
          </button>
          <button
            type="button"
            className="studio-toolbar-button studio-toolbar-button--accent"
            onClick={handleExport}
          >
            Export stereo WAV
          </button>
          <button
            type="button"
            className={`studio-toggle ${livePreview ? 'is-active' : ''}`}
            aria-pressed={livePreview}
            onClick={() => setLivePreview((current) => !current)}
          >
            Live preview
          </button>
          <div className="studio-theme-buttons" role="group" aria-label="Theme mode">
            {THEME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`studio-theme-button ${themeMode === mode ? 'is-active' : ''}`}
                aria-pressed={themeMode === mode}
                onClick={() => setThemeMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="studio-workspace" style={workspaceStyle}>
        <aside className="studio-pane studio-pane--left">
          <div className="studio-pane__header">
            <div>
              <p className="studio-panel-kicker">Workspace</p>
              <h2>Sources and stack</h2>
            </div>
            <span>{patch.layers.length}/{MAX_STUDIO_LAYERS} layers</span>
          </div>

          <div className="studio-tab-bar" role="tablist" aria-label="Studio library and layers">
            <button
              type="button"
              role="tab"
              className={`studio-tab ${leftSidebarTab === 'layers' ? 'is-active' : ''}`}
              aria-selected={leftSidebarTab === 'layers'}
              onClick={() => setLeftSidebarTab('layers')}
            >
              Layers
            </button>
            <button
              type="button"
              role="tab"
              className={`studio-tab ${leftSidebarTab === 'browser' ? 'is-active' : ''}`}
              aria-selected={leftSidebarTab === 'browser'}
              onClick={() => setLeftSidebarTab('browser')}
            >
              Browser
            </button>
          </div>

          <div className="studio-pane__body">
            {leftSidebarTab === 'layers' ? (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Layers</p>
                    <h2>Patch stack</h2>
                  </div>
                  <span>{selectedLayer?.name ?? 'No selection'}</span>
                </div>

                <div className="studio-layer-actions">
                  <button type="button" className="studio-toolbar-button" onClick={handleAddLayer}>
                    Add layer
                  </button>
                  <button
                    type="button"
                    className="studio-toolbar-button"
                    onClick={handleDuplicateLayer}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="studio-toolbar-button"
                    onClick={() => handleRemoveLayer()}
                  >
                    Delete
                  </button>
                </div>

                <div className="studio-list-scroll studio-layer-list" role="list" aria-label="Patch layers">
                  {patch.layers.map((layer) => {
                    const isSelected = layer.id === selectedLayer?.id

                    return (
                      <div key={layer.id} className={`studio-layer-card ${isSelected ? 'is-active' : ''}`}>
                        <button
                          type="button"
                          className="studio-layer-main"
                          onClick={() => {
                            setSelectedLayerId(layer.id)
                            setInspectorTab('layer')
                          }}
                        >
                          <strong>{layer.name}</strong>
                          <span>
                            {formatWaveformLabel(layer.waveform)} • {formatMilliseconds(layer.durationMs)}
                          </span>
                        </button>
                        <div className="studio-layer-card__actions">
                          <button type="button" onClick={() => toggleLayerEnabled(layer.id)}>
                            {layer.enabled ? 'Mute' : 'On'}
                          </button>
                          <button type="button" onClick={() => toggleLayerSolo(layer.id)}>
                            {layer.solo ? 'Soloed' : 'Solo'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLayerId(layer.id)
                              setInspectorTab('layer')
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Source</p>
                    <h2>Patch browser</h2>
                  </div>
                  <span>{availableSources.length} sources</span>
                </div>

                <div className="studio-list-scroll studio-source-list" aria-label="Studio patch browser">
                  {availableSources.map((source) => {
                    const isActive = selectedLibraryId === source.id

                    return (
                      <button
                        key={source.id}
                        type="button"
                        className={`studio-source-card ${isActive ? 'is-active' : ''}`}
                        aria-pressed={isActive}
                        onClick={() => {
                          setSelectedLibraryId(source.id)
                          handlePatchSourceSelect(source.id, source.source)
                        }}
                      >
                        <span>{source.source === 'studio' ? 'Studio patch' : 'Landing preset'}</span>
                        <strong>{source.name}</strong>
                        <small>{source.description}</small>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </aside>

        <div
          className="studio-resizer studio-resizer--left"
          role="separator"
          aria-label="Resize left studio sidebar"
          aria-orientation="vertical"
          onPointerDown={beginResize('left')}
        />

        <section className="studio-pane studio-pane--center">
          <div className="studio-hero-card">
            <div className="studio-hero-copy">
              <p className="studio-panel-kicker">Advanced Studio</p>
              <h1>{patch.name}</h1>
              <p>{patch.description}</p>
            </div>

            <div className="studio-fact-row">
              <div>
                <span>Patch length</span>
                <strong>{formatMilliseconds(patch.durationMs)}</strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedLayer?.name ?? 'None'}</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>{livePreview ? 'Live preview' : 'Release to preview'}</strong>
              </div>
            </div>
          </div>

          <div className="studio-wave-card">
            <div className="studio-panel-head">
              <div>
                <p className="studio-panel-kicker">Preview</p>
                <h2>Waveform canvas</h2>
              </div>
              <span>{isPlaying ? 'Playing' : 'Ready'}</span>
            </div>

            <div className="studio-wave-stage">
              <svg
                className="studio-wave"
                viewBox="0 0 960 300"
                role="img"
                aria-label="Studio waveform preview"
              >
                <defs>
                  <linearGradient id="studioWaveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <path className="studio-wave__ghost" d="M0 150 L960 150" />
                <path className="studio-wave__line" d={waveformPath} />
              </svg>
            </div>

            <div className="studio-wave-meta">
              <span>
                {selectedLayer
                  ? `${selectedLayer.name}: ${formatFrequency(selectedLayer.startFreq)} to ${formatFrequency(selectedLayer.endFreq)}`
                  : 'No layer selected.'}
              </span>
              <span>
                {patch.master.delayMix > 0
                  ? `Delay ${Math.round(patch.master.delayMix * 100)}%`
                  : 'Dry patch'}
              </span>
              <span>{patch.master.stereoWidth.toFixed(2)}x width</span>
            </div>
          </div>

          <div className="studio-summary-grid">
            <section className="studio-summary-card">
              <div className="studio-panel-head">
                <div>
                  <p className="studio-panel-kicker">Master</p>
                  <h2>Output bus</h2>
                </div>
              </div>
              <div className="studio-summary-list">
                <span>Gain {Math.round(patch.master.gain * 100)}%</span>
                <span>Drive {Math.round(patch.master.drive * 100)}%</span>
                <span>Delay {Math.round(patch.master.delayMix * 100)}%</span>
                <span>Width {patch.master.stereoWidth.toFixed(2)}x</span>
              </div>
            </section>

            <section className="studio-summary-card">
              <div className="studio-panel-head">
                <div>
                  <p className="studio-panel-kicker">Selection</p>
                  <h2>{selectedLayer?.name ?? 'Layer'}</h2>
                </div>
              </div>
              {selectedLayer ? (
                <div className="studio-summary-list">
                  <span>{formatWaveformLabel(selectedLayer.waveform)}</span>
                  <span>{formatMilliseconds(selectedLayer.durationMs)}</span>
                  <span>Pan {Math.round(selectedLayer.pan * 100)}</span>
                  <span>{selectedLayer.filter.type}</span>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <div
          className="studio-resizer studio-resizer--right"
          role="separator"
          aria-label="Resize right studio inspector"
          aria-orientation="vertical"
          onPointerDown={beginResize('right')}
        />

        <aside className="studio-pane studio-pane--right">
          <div className="studio-pane__header">
            <div>
              <p className="studio-panel-kicker">Inspector</p>
              <h2>{selectedLayer?.name ?? patch.name}</h2>
            </div>
            <div className="studio-reorder-actions">
              <button type="button" onClick={() => handleMoveLayer(-1)}>
                Up
              </button>
              <button type="button" onClick={() => handleMoveLayer(1)}>
                Down
              </button>
            </div>
          </div>

          <div className="studio-tab-bar studio-tab-bar--inspector" role="tablist" aria-label="Inspector sections">
            {([
              ['layer', 'Layer'],
              ['envelope', 'Envelope'],
              ['filter', 'Filter'],
              ['master', 'Master'],
            ] as Array<[InspectorTab, string]>).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                className={`studio-tab ${inspectorTab === tabId ? 'is-active' : ''}`}
                aria-selected={inspectorTab === tabId}
                onClick={() => setInspectorTab(tabId)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="studio-pane__body">
            {inspectorTab === 'layer' && selectedLayer ? (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Layer</p>
                    <h2>{selectedLayer.name}</h2>
                  </div>
                </div>

                <label className="studio-input-wrap" htmlFor="layer-name-input">
                  <span>Layer name</span>
                  <input
                    id="layer-name-input"
                    value={selectedLayer.name}
                    onChange={(event) => handleLayerNameChange(event.currentTarget.value)}
                  />
                </label>

                <div className="studio-option-group" role="group" aria-label="Layer waveform">
                  {waveformOptions.map((waveform) => (
                    <button
                      key={waveform}
                      type="button"
                      className={`studio-chip ${selectedLayer.waveform === waveform ? 'is-active' : ''}`}
                      aria-pressed={selectedLayer.waveform === waveform}
                      onClick={() => handleWaveformChange(waveform)}
                    >
                      {formatWaveformLabel(waveform)}
                    </button>
                  ))}
                </div>

                <div className="studio-scroll-grid">
                  {layerControlConfigs.map((control) => (
                    <label key={control.key} className="studio-slider-card">
                      <span>
                        {control.label}
                        <strong>{control.format(selectedLayer[control.key])}</strong>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedLayer[control.key]}
                        onChange={(event) => updateLayerValue(control.key, Number(event.currentTarget.value))}
                        onPointerUp={handleRangeCommit}
                        onKeyUp={(event) => handleRangeCommitKey(event.key)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {inspectorTab === 'envelope' && selectedLayer ? (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Envelope</p>
                    <h2>Amp contour</h2>
                  </div>
                </div>

                <div className="studio-scroll-grid">
                  {envelopeControlConfigs.map((control) => (
                    <label key={control.key} className="studio-slider-card">
                      <span>
                        {control.label}
                        <strong>{control.format(selectedLayer.envelope[control.key])}</strong>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedLayer.envelope[control.key]}
                        onChange={(event) => updateEnvelopeValue(control.key, Number(event.currentTarget.value))}
                        onPointerUp={handleRangeCommit}
                        onKeyUp={(event) => handleRangeCommitKey(event.key)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {inspectorTab === 'filter' && selectedLayer ? (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Filter</p>
                    <h2>Tone shaping</h2>
                  </div>
                </div>

                <div className="studio-option-group" role="group" aria-label="Layer filter type">
                  {filterTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`studio-chip ${selectedLayer.filter.type === type ? 'is-active' : ''}`}
                      aria-pressed={selectedLayer.filter.type === type}
                      onClick={() => handleFilterTypeChange(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="studio-scroll-grid">
                  {filterControlConfigs.map((control) => (
                    <label key={control.key} className="studio-slider-card">
                      <span>
                        {control.label}
                        <strong>{control.format(selectedLayer.filter[control.key])}</strong>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedLayer.filter[control.key]}
                        onChange={(event) => updateFilterValue(control.key, Number(event.currentTarget.value))}
                        onPointerUp={handleRangeCommit}
                        onKeyUp={(event) => handleRangeCommitKey(event.key)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {inspectorTab === 'master' ? (
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Master</p>
                    <h2>Patch bus</h2>
                  </div>
                </div>

                <label className="studio-slider-card studio-slider-card--single">
                  <span>
                    Patch duration
                    <strong>{formatMilliseconds(patch.durationMs)}</strong>
                  </span>
                  <input
                    type="range"
                    min={STUDIO_LIMITS.patchDurationMs.min}
                    max={STUDIO_LIMITS.patchDurationMs.max}
                    step={STUDIO_LIMITS.patchDurationMs.step}
                    value={patch.durationMs}
                    onChange={(event) => updatePatchDuration(Number(event.currentTarget.value))}
                    onPointerUp={handleRangeCommit}
                    onKeyUp={(event) => handleRangeCommitKey(event.key)}
                  />
                </label>

                <div className="studio-scroll-grid">
                  {masterControlConfigs.map((control) => (
                    <label key={control.key} className="studio-slider-card">
                      <span>
                        {control.label}
                        <strong>{control.format(patch.master[control.key])}</strong>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={patch.master[control.key]}
                        onChange={(event) => updateMasterValue(control.key, Number(event.currentTarget.value))}
                        onPointerUp={handleRangeCommit}
                        onKeyUp={(event) => handleRangeCommitKey(event.key)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="studio-statusbar" aria-label="Studio status">
        <p role="status" aria-live="polite">
          {status}
        </p>
        <div className="studio-statusbar__meta">
          <span>{patch.layers.filter((layer) => layer.enabled).length} active layers</span>
          <span>{formatMilliseconds(patch.durationMs)}</span>
          <span>{livePreview ? 'Live preview on' : 'Preview on demand'}</span>
        </div>
      </section>
    </main>
  )
}

export default StudioPage
