import {
  useCallback,
  useDeferredValue,
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
const PANEL_RAIL_WIDTH = 56
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 460
const MIN_CENTER_WIDTH = 540
const TIMELINE_MARKER_DIVISIONS = 8
const TIMELINE_LAYER_WAVE_WIDTH = 720
const TIMELINE_LAYER_WAVE_HEIGHT = 72

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
type InspectorTab = 'layer' | 'envelope' | 'filter' | 'master'
type ResizePane = 'left' | 'right'
type TimelineDragMode = 'move' | 'resize-end'

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

type TimelineDragState = {
  layerId: string
  mode: TimelineDragMode
  startX: number
  startMs: number
  durationMs: number
  didChange: boolean
}

type WorkspaceStyle = CSSProperties & {
  '--studio-left-width': string
  '--studio-left-resizer-width': string
  '--studio-right-width': string
  '--studio-right-resizer-width': string
}

const INSPECTOR_TAB_ITEMS: Array<{ id: InspectorTab; label: string; railLabel: string }> = [
  { id: 'layer', label: 'Layer', railLabel: 'Layer' },
  { id: 'envelope', label: 'Envelope', railLabel: 'Env' },
  { id: 'filter', label: 'Filter', railLabel: 'Filter' },
  { id: 'master', label: 'Master', railLabel: 'Master' },
]

const LAYER_INSPECTOR_TAB_ITEMS = INSPECTOR_TAB_ITEMS.filter((tab) => tab.id !== 'master')
const MASTER_INSPECTOR_TAB_ITEMS = INSPECTOR_TAB_ITEMS.filter((tab) => tab.id === 'master')

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

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step
}

function constrainLayerToPatchDuration(layer: StudioLayer, patchDurationMs: number) {
  const maxDurationMs = Math.max(
    STUDIO_LIMITS.layerDurationMs.min,
    Math.min(STUDIO_LIMITS.layerDurationMs.max, patchDurationMs),
  )
  const durationMs = Math.min(layer.durationMs, maxDurationMs)
  const maxStartMs = Math.max(0, patchDurationMs - durationMs)

  return {
    ...layer,
    startMs: Math.min(Math.max(layer.startMs, 0), maxStartMs),
    durationMs,
  }
}

function normalizePatchTimelineBounds(patch: StudioPatch) {
  const clampedPatch = clampStudioPatch(patch)

  return {
    ...clampedPatch,
    layers: clampedPatch.layers.map((layer) => constrainLayerToPatchDuration(layer, clampedPatch.durationMs)),
  }
}

function getTimelineClipStyle(layer: StudioLayer, patchDurationMs: number): CSSProperties {
  const safePatchDurationMs = Math.max(patchDurationMs, 1)
  const clipStartMs = Math.min(Math.max(layer.startMs, 0), safePatchDurationMs)
  const clipEndMs = Math.min(safePatchDurationMs, layer.startMs + layer.durationMs)
  const leftPercent = (clipStartMs / safePatchDurationMs) * 100
  const maxWidthPercent = Math.max(0, 100 - leftPercent)
  const visibleDurationMs = Math.max(0, clipEndMs - clipStartMs)
  const widthPercent = Math.min(
    maxWidthPercent,
    Math.max(Math.min(2.4, maxWidthPercent), (visibleDurationMs / safePatchDurationMs) * 100),
  )

  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  }
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
    return normalizePatchTimelineBounds(JSON.parse(stored) as StudioPatch)
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
    const parsed = JSON.parse(stored) as {
      leftPanelWidth?: number
      rightPanelWidth?: number
      isLeftPanelOpen?: boolean
      isRightPanelOpen?: boolean
    }

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
      isLeftPanelOpen: parsed.isLeftPanelOpen ?? true,
      isRightPanelOpen: parsed.isRightPanelOpen ?? true,
    }
  } catch {
    return null
  }
}

function createLayerId() {
  return `layer-${Math.random().toString(36).slice(2, 8)}`
}

function isKeyboardShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName))
  )
}

function BrowserRailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4.5 6.75a2.25 2.25 0 0 1 2.25-2.25h3.15l1.65 1.8h5.7a2.25 2.25 0 0 1 2.25 2.25v8.7a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25v-10.5Z" />
      <path d="M4.5 9h15" />
    </svg>
  )
}

function InspectorRailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 5.25v13.5" />
      <path d="M12 5.25v13.5" />
      <path d="M18 5.25v13.5" />
      <circle cx="6" cy="9" r="2.25" />
      <circle cx="12" cy="14.25" r="2.25" />
      <circle cx="18" cy="8.25" r="2.25" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const path = direction === 'left' ? 'M14.25 5.25 8.25 12l6 6.75' : 'm9.75 5.25 6 6.75-6 6.75'

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={path} />
    </svg>
  )
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
  const storedDraft = useMemo(() => getStoredStudioPatch(), [])
  const initialPatch = useMemo(
    () =>
      normalizePatchTimelineBounds(
        importedPreset
          ? simplePresetToStudioPatch(importedPreset)
          : storedDraft ?? cloneStudioPatch(STUDIO_PATCHES[0]),
      ),
    [importedPreset, storedDraft],
  )
  const initialLayout = useMemo(() => getStoredStudioLayout(), [])
  const [patch, setPatch] = useState<StudioPatch>(initialPatch)
  const deferredPatch = useDeferredValue(patch)
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(
    importedPreset ? `simple-${importedPreset.id}` : initialPatch.id,
  )
  const [selectedLayerId, setSelectedLayerId] = useState<string>(initialPatch.layers[0]?.id ?? 'layer-1')
  const [status, setStatus] = useState(
    importedPreset
      ? `Imported ${importedPreset.name} from the landing page into the advanced studio.`
      : 'Advanced studio ready. Drag clips in the timeline, resize layers, and audition without page scrolling.',
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [livePreview, setLivePreview] = useState(false)
  const [hasPatchChanges, setHasPatchChanges] = useState(Boolean(storedDraft && !importedPreset))
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layer')
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(initialLayout?.isLeftPanelOpen ?? true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(initialLayout?.isRightPanelOpen ?? true)
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
  const timelineMeasureRef = useRef<HTMLDivElement | null>(null)
  const timelineDragStateRef = useRef<TimelineDragState | null>(null)

  const activeLayerId = patch.layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : (patch.layers[0]?.id ?? 'layer-1')
  const selectedLayer = patch.layers.find((layer) => layer.id === activeLayerId) ?? patch.layers[0]
  const isMasterInspectorTab = inspectorTab === 'master'
  const inspectorHeaderTitle = isMasterInspectorTab ? 'Patch output' : 'Layer inspector'
  const inspectorHeaderCopy = isMasterInspectorTab
    ? 'Master controls shape the final mix after all layers are combined.'
    : `Selected layer: ${selectedLayer?.name ?? 'None'}. Layer, Envelope, and Filter apply only to this layer.`
  const inspectorScopeLabel = isMasterInspectorTab ? 'Patch scope' : 'Layer scope'
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
    const render = renderStudioPatch(deferredPatch, { sampleRate: 6000, seed: 17 })
    return toWaveformPath(mixStereoForDisplay(render), 960, 300)
  }, [deferredPatch])
  const timelineMarkers = useMemo(
    () =>
      Array.from({ length: TIMELINE_MARKER_DIVISIONS + 1 }, (_, index) => {
        const ratio = index / TIMELINE_MARKER_DIVISIONS

        return {
          id: `marker-${index}`,
          label: formatMilliseconds(Math.round(patch.durationMs * ratio)),
          left: `${ratio * 100}%`,
        }
      }),
    [patch.durationMs],
  )
  const layerWaveformPaths = useMemo(
    () =>
      Object.fromEntries(
        deferredPatch.layers.map((layer) => {
          const render = renderStudioPatch(
            {
              ...deferredPatch,
              durationMs: layer.durationMs,
              layers: [{ ...layer, startMs: 0, enabled: true, solo: false }],
              master: {
                ...deferredPatch.master,
                gain: 1,
                drive: 0,
                delayMix: 0,
                delayFeedback: 0,
                stereoWidth: 1,
              },
            },
            { sampleRate: 3000, seed: 17 },
          )

          return [
            layer.id,
            toWaveformPath(mixStereoForDisplay(render), TIMELINE_LAYER_WAVE_WIDTH, TIMELINE_LAYER_WAVE_HEIGHT),
          ]
        }),
      ) as Record<string, string>,
    [deferredPatch],
  )
  const workspaceStyle = useMemo<WorkspaceStyle>(
    () => ({
      '--studio-left-width': `${isLeftPanelOpen ? leftPanelWidth : PANEL_RAIL_WIDTH}px`,
      '--studio-left-resizer-width': isLeftPanelOpen ? '12px' : '0px',
      '--studio-right-width': `${isRightPanelOpen ? rightPanelWidth : PANEL_RAIL_WIDTH}px`,
      '--studio-right-resizer-width': isRightPanelOpen ? '12px' : '0px',
    }),
    [isLeftPanelOpen, isRightPanelOpen, leftPanelWidth, rightPanelWidth],
  )

  useEffect(() => {
    patchRef.current = patch
    window.localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(patch))
  }, [patch])

  useEffect(() => {
    panelWidthsRef.current = { left: leftPanelWidth, right: rightPanelWidth }
    window.localStorage.setItem(
      STUDIO_LAYOUT_STORAGE_KEY,
      JSON.stringify({ leftPanelWidth, rightPanelWidth, isLeftPanelOpen, isRightPanelOpen }),
    )
  }, [isLeftPanelOpen, isRightPanelOpen, leftPanelWidth, rightPanelWidth])

  useEffect(() => {
    document.body.dataset.studio = 'true'

    return () => {
      delete document.body.dataset.studio
      delete document.body.dataset.resizing
      delete document.body.dataset.timelineDrag
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

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = timelineDragStateRef.current

      if (!dragState) {
        return
      }

      const timelineWidth = timelineMeasureRef.current?.getBoundingClientRect().width ?? 0

      if (timelineWidth <= 0) {
        return
      }

      const currentPatch = patchRef.current
      const currentLayer = currentPatch.layers.find((layer) => layer.id === dragState.layerId)

      if (!currentLayer) {
        return
      }

      const deltaMs = roundToStep(
        ((event.clientX - dragState.startX) / timelineWidth) * currentPatch.durationMs,
        STUDIO_LIMITS.layerStartMs.step,
      )

      if (dragState.mode === 'move') {
        const maxStartMs = Math.max(0, currentPatch.durationMs - dragState.durationMs)
        const nextStartMs = Math.min(Math.max(dragState.startMs + deltaMs, 0), maxStartMs)

        if (nextStartMs === currentLayer.startMs) {
          return
        }

        dragState.didChange = true
        const nextPatch = normalizePatchTimelineBounds({
          ...currentPatch,
          layers: currentPatch.layers.map((layer) =>
            layer.id === dragState.layerId ? { ...layer, startMs: nextStartMs } : layer,
          ),
        })
        patchRef.current = nextPatch
        setPatch(nextPatch)
        return
      }

      const maxDurationMs = Math.max(
        STUDIO_LIMITS.layerDurationMs.min,
        Math.min(STUDIO_LIMITS.layerDurationMs.max, currentPatch.durationMs - dragState.startMs),
      )
      const nextDurationMs = Math.min(
        Math.max(dragState.durationMs + deltaMs, STUDIO_LIMITS.layerDurationMs.min),
        maxDurationMs,
      )

      if (nextDurationMs === currentLayer.durationMs) {
        return
      }

      dragState.didChange = true
      const nextPatch = normalizePatchTimelineBounds({
        ...currentPatch,
        layers: currentPatch.layers.map((layer) =>
          layer.id === dragState.layerId ? { ...layer, durationMs: nextDurationMs } : layer,
        ),
      })
      patchRef.current = nextPatch
      setPatch(nextPatch)
    }

    const finishTimelineDrag = (previewOnCommit: boolean) => {
      const dragState = timelineDragStateRef.current

      if (!dragState) {
        return
      }

      timelineDragStateRef.current = null
      delete document.body.dataset.timelineDrag

      if (previewOnCommit && dragState.didChange) {
        void playPatch(patchRef.current, `Previewing ${patchRef.current.name}.`)
      }
    }

    const handlePointerUp = () => {
      finishTimelineDrag(true)
    }

    const handlePointerCancel = () => {
      finishTimelineDrag(false)
    }

    const handleWindowBlur = () => {
      finishTimelineDrag(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [playPatch])

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

  const beginTimelineDrag = useCallback(
    (layerId: string, mode: TimelineDragMode) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const layer = patchRef.current.layers.find((candidate) => candidate.id === layerId)

      if (!layer) {
        return
      }

      setSelectedLayerId(layerId)
      setInspectorTab('layer')
      timelineDragStateRef.current = {
        layerId,
        mode,
        startX: event.clientX,
        startMs: layer.startMs,
        durationMs: layer.durationMs,
        didChange: false,
      }
      document.body.dataset.timelineDrag = mode
    },
    [],
  )

  function commitPatch(
    nextPatch: StudioPatch,
    options: { preview?: boolean; resetDirty?: boolean; status?: string } = {},
  ) {
    const normalizedPatch = normalizePatchTimelineBounds(nextPatch)
    patchRef.current = normalizedPatch
    setPatch(normalizedPatch)
    setHasPatchChanges(!options.resetDirty)

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
    if (
      hasPatchChanges &&
      !window.confirm(
        'Loading a preset will replace the current timeline. Your customizations will be lost. Continue?',
      )
    ) {
      return
    }

    if (sourceType === 'simple') {
      const presetId = sourceId.replace(/^simple-/, '')
      const preset = PRESETS.find((candidate) => candidate.id === presetId)

      if (!preset) {
        return
      }

      const nextPatch = simplePresetToStudioPatch(preset)
      setSelectedLibraryId(sourceId)
      setSelectedLayerId(nextPatch.layers[0]?.id ?? 'layer-1')
      setInspectorTab('layer')
      commitPatch(nextPatch, { resetDirty: true, status: `Imported ${preset.name} into the studio.` })
      return
    }

    const preset = STUDIO_PATCHES.find((candidate) => candidate.id === sourceId)

    if (!preset) {
      return
    }

    const nextPatch = cloneStudioPatch(preset)
    setSelectedLibraryId(sourceId)
    setSelectedLayerId(nextPatch.layers[0]?.id ?? 'layer-1')
    commitPatch(nextPatch, { resetDirty: true, status: `Loaded ${preset.name}.` })
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
    commitPatch(
      {
        ...patchRef.current,
        durationMs,
        layers: patchRef.current.layers.map((layer) => constrainLayerToPatchDuration(layer, durationMs)),
      },
      { preview: true },
    )
  }

  function updateLayerById(
    layerId: string,
    updater: (layer: StudioLayer) => StudioLayer,
    options: { preview?: boolean; resetDirty?: boolean; status?: string } = {},
  ) {
    const currentLayer = patchRef.current.layers.find((layer) => layer.id === layerId)

    if (!currentLayer) {
      return
    }

    const nextPatch = {
      ...patchRef.current,
      layers: patchRef.current.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    }

    commitPatch(nextPatch, options)
  }

  function updateSelectedLayer(
    updater: (layer: StudioLayer) => StudioLayer,
    options: { preview?: boolean; resetDirty?: boolean; status?: string } = {},
  ) {
    updateLayerById(activeLayerId, updater, options)
  }

  function updateLayerValue(key: LayerNumericKey, value: number) {
    updateSelectedLayer((layer) => ({ ...layer, [key]: value }), { preview: true })
  }

  function updateLayerStartMs(layerId: string, value: number) {
    const layer = patchRef.current.layers.find((candidate) => candidate.id === layerId)

    if (!layer) {
      return
    }

    const roundedValue = roundToStep(Number.isFinite(value) ? value : 0, STUDIO_LIMITS.layerStartMs.step)
    const maxStartMs = Math.max(0, patchRef.current.durationMs - layer.durationMs)
    const nextStartMs = Math.min(Math.max(roundedValue, STUDIO_LIMITS.layerStartMs.min), maxStartMs)

    setSelectedLayerId(layerId)
    setInspectorTab('layer')
    updateLayerById(layerId, (currentLayer) => ({ ...currentLayer, startMs: nextStartMs }), {
      preview: true,
    })
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
    const nextLayer = createStudioLayer(
      createLayerId(),
      `Layer ${patchRef.current.layers.length + 1}`,
      {
        startMs: Math.min(patchRef.current.durationMs - 40, patchRef.current.layers.length * 28),
      },
    )
    const nextPatch = { ...patchRef.current, layers: [...patchRef.current.layers, nextLayer] }

    setSelectedLayerId(nextLayer.id)
    setInspectorTab('layer')
    commitPatch(nextPatch, { status: `Added ${nextLayer.name}.` })
  }

  function handleDuplicateLayer() {
    if (!selectedLayer) {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedLayer || event.repeat || isKeyboardShortcutTarget(event.target)) {
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()

        if (patchRef.current.layers.length === 1) {
          setStatus('A patch needs at least one layer.')
          return
        }

        const removedIndex = patchRef.current.layers.findIndex((layer) => layer.id === selectedLayer.id)
        const nextLayers = patchRef.current.layers.filter((layer) => layer.id !== selectedLayer.id)
        const fallbackLayer = nextLayers[Math.min(removedIndex, nextLayers.length - 1)] ?? nextLayers[0]
        const normalizedPatch = normalizePatchTimelineBounds({
          ...patchRef.current,
          layers: nextLayers,
        })

        patchRef.current = normalizedPatch
        setPatch(normalizedPatch)
        setHasPatchChanges(true)
        setSelectedLayerId(fallbackLayer?.id ?? 'layer-1')
        setStatus(`Removed ${selectedLayer.name}.`)
        return
      }

      if (
        event.code === 'KeyD' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault()

        const duplicate = createStudioLayer(createLayerId(), `${selectedLayer.name} Copy`, {
          ...selectedLayer,
          id: createLayerId(),
          name: `${selectedLayer.name} Copy`,
          pan: Math.max(-1, Math.min(1, selectedLayer.pan * -1 || 0.18)),
          detuneCents: selectedLayer.detuneCents + 12,
          startMs: selectedLayer.startMs + 12,
        })
        const normalizedPatch = normalizePatchTimelineBounds({
          ...patchRef.current,
          layers: [...patchRef.current.layers, duplicate],
        })

        patchRef.current = normalizedPatch
        setPatch(normalizedPatch)
        setHasPatchChanges(true)
        setSelectedLayerId(duplicate.id)
        setInspectorTab('layer')
        setStatus(`Duplicated ${selectedLayer.name}.`)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedLayer])

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

      <section className={`studio-workspace${!isLeftPanelOpen ? ' is-left-collapsed' : ''}${!isRightPanelOpen ? ' is-right-collapsed' : ''}`} style={workspaceStyle}>
        <aside className={`studio-pane studio-pane--left ${!isLeftPanelOpen ? 'is-collapsed' : ''}`}>
          <button
            type="button"
            className="studio-pane-rail studio-pane-rail--left"
            aria-label={`${isLeftPanelOpen ? 'Collapse' : 'Expand'} source browser`}
            aria-controls="studio-left-pane-content"
            aria-expanded={isLeftPanelOpen}
            onClick={() => setIsLeftPanelOpen((current) => !current)}
          >
            <span className="studio-pane-rail__icon">
              <BrowserRailIcon />
            </span>
            <span className="studio-pane-rail__chevron">
              <ChevronIcon direction={isLeftPanelOpen ? 'left' : 'right'} />
            </span>
          </button>

          <div
            id="studio-left-pane-content"
            className="studio-pane__content studio-pane__content--left"
            hidden={!isLeftPanelOpen}
          >
            <div className="studio-pane__header">
              <div>
                <p className="studio-panel-kicker">Browser</p>
                <h2>Patch browser</h2>
              </div>
              <span>{availableSources.length} sources</span>
            </div>

            <div className="studio-pane__body">
              <section className="studio-section-card studio-section-card--fill">
                <div className="studio-panel-head">
                  <div>
                    <p className="studio-panel-kicker">Source</p>
                    <h2>Load a starting point</h2>
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
                        onClick={() => handlePatchSourceSelect(source.id, source.source)}
                      >
                        <span>{source.source === 'studio' ? 'Studio patch' : 'Landing preset'}</span>
                        <strong>{source.name}</strong>
                        <small>{source.description}</small>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </aside>

        {isLeftPanelOpen ? (
          <div
            className="studio-resizer studio-resizer--left"
            role="separator"
            aria-label="Resize left studio sidebar"
            aria-orientation="vertical"
            onPointerDown={beginResize('left')}
          />
        ) : null}

        <section className="studio-pane studio-pane--center">
          <div className="studio-wave-card">
            <div className="studio-panel-head">
              <div>
                <p className="studio-panel-kicker">Mix</p>
                <h2>Final waveform</h2>
                <p className="studio-panel-copy">{patch.description}</p>
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
                {patch.layers.length} layers • {formatMilliseconds(patch.durationMs)}
              </span>
              <span>{selectedLayer ? `Selected ${selectedLayer.name}` : 'No layer selected.'}</span>
              <span>{livePreview ? 'Live preview' : 'Release to preview'}</span>
            </div>
          </div>

          <section className="studio-timeline-card">
            <div className="studio-panel-head">
              <div>
                <p className="studio-panel-kicker">Timeline</p>
                <h2>Layer editor</h2>
              </div>
              <div className="studio-panel-head__actions">
                <p className="studio-panel-copy">
                  {patch.layers.length} layers. Drag clips to move them. Drag the edge to resize.
                </p>
                <div className="studio-panel-actions">
                  <button type="button" className="studio-toolbar-button" onClick={handleAddLayer}>
                    Add layer
                  </button>
                  <button type="button" className="studio-toolbar-button" onClick={handleDuplicateLayer}>
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
              </div>
            </div>

            <div className="studio-timeline-scroll">
              <div className="studio-timeline-board" role="group" aria-label="Layer timeline">
                <div className="studio-timeline-ruler-label">
                  <span>Tracks</span>
                  <strong>{patch.layers.length} rows</strong>
                </div>

                <div className="studio-timeline-ruler" ref={timelineMeasureRef}>
                  {timelineMarkers.map((marker) => (
                    <div
                      key={marker.id}
                      className="studio-timeline-ruler__marker"
                      style={{ left: marker.left }}
                    >
                      <span>{marker.label}</span>
                    </div>
                  ))}
                </div>

                {patch.layers.flatMap((layer) => {
                  const isSelected = layer.id === selectedLayer?.id

                  return [
                    <div
                      key={`${layer.id}-head`}
                      className={`studio-timeline-track-head ${isSelected ? 'is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="studio-timeline-track-select"
                        aria-label={`Select ${layer.name} in timeline`}
                        onClick={() => {
                          setSelectedLayerId(layer.id)
                          setInspectorTab('layer')
                        }}
                      >
                        <strong>{layer.name}</strong>
                        <span>{formatMilliseconds(layer.durationMs)} long</span>
                      </button>

                      <label className="studio-timeline-track-start" htmlFor={`layer-start-${layer.id}`}>
                        <span>Start</span>
                        <div className="studio-timeline-track-start__field">
                          <input
                            id={`layer-start-${layer.id}`}
                            type="number"
                            min={0}
                            max={Math.max(0, patch.durationMs - layer.durationMs)}
                            step={STUDIO_LIMITS.layerStartMs.step}
                            aria-label={`Start time for ${layer.name}`}
                            value={layer.startMs}
                            onFocus={() => {
                              setSelectedLayerId(layer.id)
                              setInspectorTab('layer')
                            }}
                            onChange={(event) => updateLayerStartMs(layer.id, Number(event.currentTarget.value))}
                            onKeyUp={(event) => handleRangeCommitKey(event.key)}
                            onBlur={handleRangeCommit}
                          />
                          <small>ms</small>
                        </div>
                      </label>

                      <div className="studio-timeline-track-head__actions">
                        <button
                          type="button"
                          aria-pressed={!layer.enabled}
                          aria-label={`${layer.enabled ? 'Mute' : 'Enable'} ${layer.name}`}
                          onClick={() => toggleLayerEnabled(layer.id)}
                        >
                          {layer.enabled ? 'M' : 'On'}
                        </button>
                        <button
                          type="button"
                          aria-pressed={layer.solo}
                          aria-label={`${layer.solo ? 'Release solo on' : 'Solo'} ${layer.name}`}
                          onClick={() => toggleLayerSolo(layer.id)}
                        >
                          {layer.solo ? 'S' : 'Solo'}
                        </button>
                      </div>
                    </div>,
                    <div key={`${layer.id}-track`} className={`studio-timeline-track ${isSelected ? 'is-active' : ''}`}>
                      <button
                        type="button"
                        className="studio-timeline-track-surface"
                        aria-label={`Timeline track for ${layer.name}`}
                        onClick={() => {
                          setSelectedLayerId(layer.id)
                          setInspectorTab('layer')
                        }}
                      />

                      <div
                        className={`studio-timeline-track-clip ${!layer.enabled ? 'is-muted' : ''} ${layer.solo ? 'is-solo' : ''}`}
                        style={getTimelineClipStyle(layer, patch.durationMs)}
                        onClick={() => {
                          setSelectedLayerId(layer.id)
                          setInspectorTab('layer')
                        }}
                        onPointerDown={beginTimelineDrag(layer.id, 'move')}
                      >
                        <svg
                          className="studio-timeline-track-clip__wave"
                          viewBox={`0 0 ${TIMELINE_LAYER_WAVE_WIDTH} ${TIMELINE_LAYER_WAVE_HEIGHT}`}
                          aria-hidden="true"
                        >
                          <path
                            className="studio-timeline-track-clip__ghost"
                            d={`M0 ${TIMELINE_LAYER_WAVE_HEIGHT / 2} L${TIMELINE_LAYER_WAVE_WIDTH} ${TIMELINE_LAYER_WAVE_HEIGHT / 2}`}
                          />
                          <path
                            className="studio-timeline-track-clip__line"
                            d={layerWaveformPaths[layer.id]}
                          />
                        </svg>

                        <div className="studio-timeline-track-clip__meta">
                          <span>{formatWaveformLabel(layer.waveform)}</span>
                          <span>
                            {formatFrequency(layer.startFreq)} to {formatFrequency(layer.endFreq)}
                          </span>
                        </div>

                        <div
                          className="studio-timeline-track-clip__handle"
                          role="presentation"
                          onPointerDown={beginTimelineDrag(layer.id, 'resize-end')}
                        />
                      </div>
                    </div>,
                  ]
                })}
              </div>
            </div>
          </section>
        </section>

        {isRightPanelOpen ? (
          <div
            className="studio-resizer studio-resizer--right"
            role="separator"
            aria-label="Resize right studio inspector"
            aria-orientation="vertical"
            onPointerDown={beginResize('right')}
          />
        ) : null}

        <aside className={`studio-pane studio-pane--right ${!isRightPanelOpen ? 'is-collapsed' : ''}`}>
          <div
            id="studio-right-pane-content"
            className="studio-pane__content studio-pane__content--right"
            hidden={!isRightPanelOpen}
          >
            <div className="studio-pane__header">
              <div>
                <p className="studio-panel-kicker">Inspector</p>
                <h2>{inspectorHeaderTitle}</h2>
                <p className="studio-panel-copy">{inspectorHeaderCopy}</p>
              </div>
              <div className="studio-panel-head__actions">
                <span className="studio-pane__scope">{inspectorScopeLabel}</span>
                {!isMasterInspectorTab && selectedLayer ? (
                  <div className="studio-reorder-actions">
                    <button type="button" onClick={() => handleMoveLayer(-1)}>
                      Up
                    </button>
                    <button type="button" onClick={() => handleMoveLayer(1)}>
                      Down
                    </button>
                  </div>
                ) : null}
              </div>
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
                    <h2>Final mix</h2>
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
          </div>

          <div
            className="studio-pane-rail studio-pane-rail--right"
            onClick={(event) => {
              if (!(event.target instanceof HTMLElement)) {
                return
              }

              if (event.target.closest('.studio-pane-rail-tab, .studio-pane-rail__toggle')) {
                return
              }

              setIsRightPanelOpen((current) => !current)
            }}
          >
            <button
              type="button"
              className="studio-pane-rail__toggle studio-pane-rail__toggle--icon"
              aria-label={`${isRightPanelOpen ? 'Collapse' : 'Expand'} inspector panel`}
              aria-controls="studio-right-pane-content"
              aria-expanded={isRightPanelOpen}
              title={`${isRightPanelOpen ? 'Collapse' : 'Expand'} inspector panel`}
              onClick={(event) => {
                event.stopPropagation()
                setIsRightPanelOpen((current) => !current)
              }}
            >
              <span className="studio-pane-rail__icon studio-pane-rail__icon--inspector">
                <InspectorRailIcon />
              </span>
            </button>

            <div className="studio-pane-rail__tabs studio-pane-rail__tabs--inspector" role="tablist" aria-label="Inspector sections">
              <div className="studio-pane-rail__group">
                {LAYER_INSPECTOR_TAB_ITEMS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={`studio-pane-rail-tab ${inspectorTab === tab.id ? 'is-active' : ''}`}
                    aria-controls="studio-right-pane-content"
                    aria-label={`${tab.label} inspector`}
                    aria-selected={inspectorTab === tab.id}
                    title={tab.label}
                    onClick={(event) => {
                      event.stopPropagation()
                      setInspectorTab(tab.id)
                      setIsRightPanelOpen(true)
                    }}
                  >
                    {tab.railLabel}
                  </button>
                ))}
              </div>

              <span className="studio-pane-rail__divider" aria-hidden="true" />

              <div className="studio-pane-rail__group">
                {MASTER_INSPECTOR_TAB_ITEMS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={`studio-pane-rail-tab ${inspectorTab === tab.id ? 'is-active' : ''}`}
                    aria-controls="studio-right-pane-content"
                    aria-label={`${tab.label} inspector`}
                    aria-selected={inspectorTab === tab.id}
                    title={tab.label}
                    onClick={(event) => {
                      event.stopPropagation()
                      setInspectorTab(tab.id)
                      setIsRightPanelOpen(true)
                    }}
                  >
                    {tab.railLabel}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="studio-pane-rail__toggle studio-pane-rail__toggle--edge"
              aria-label={`${isRightPanelOpen ? 'Collapse' : 'Expand'} inspector handle`}
              aria-controls="studio-right-pane-content"
              aria-expanded={isRightPanelOpen}
              title={`${isRightPanelOpen ? 'Collapse' : 'Expand'} inspector handle`}
              onClick={(event) => {
                event.stopPropagation()
                setIsRightPanelOpen((current) => !current)
              }}
            >
              <span className="studio-pane-rail__chevron">
                <ChevronIcon direction={isRightPanelOpen ? 'right' : 'left'} />
              </span>
            </button>
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
