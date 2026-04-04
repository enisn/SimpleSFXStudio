import { clampValue, type Waveform } from '../types'

export type StudioFilterType = 'none' | 'lowpass' | 'highpass' | 'bandpass'

export interface StudioEnvelope {
  attackMs: number
  holdMs: number
  decayMs: number
  sustain: number
  releaseMs: number
}

export interface StudioFilter {
  type: StudioFilterType
  cutoffHz: number
  resonance: number
  envelopeAmount: number
}

export interface StudioLayer {
  id: string
  name: string
  enabled: boolean
  solo: boolean
  waveform: Waveform
  gain: number
  pan: number
  noise: number
  startFreq: number
  endFreq: number
  detuneCents: number
  startMs: number
  durationMs: number
  vibratoDepth: number
  vibratoRate: number
  transient: number
  envelope: StudioEnvelope
  filter: StudioFilter
}

export interface StudioMasterSettings {
  gain: number
  drive: number
  delayMix: number
  delayMs: number
  delayFeedback: number
  stereoWidth: number
}

export interface StudioPatch {
  id: string
  name: string
  description: string
  durationMs: number
  master: StudioMasterSettings
  layers: StudioLayer[]
}

export const MAX_STUDIO_LAYERS = 4
export const STUDIO_DRAFT_STORAGE_KEY = 'soundmaker-studio-draft'

export const STUDIO_LIMITS = {
  patchDurationMs: { min: 120, max: 2400, step: 5 },
  masterGain: { min: 0.1, max: 1.5, step: 0.01 },
  drive: { min: 0, max: 1, step: 0.01 },
  delayMix: { min: 0, max: 0.9, step: 0.01 },
  delayMs: { min: 20, max: 600, step: 5 },
  delayFeedback: { min: 0, max: 0.92, step: 0.01 },
  stereoWidth: { min: 0, max: 1.4, step: 0.01 },
  layerGain: { min: 0, max: 1.2, step: 0.01 },
  pan: { min: -1, max: 1, step: 0.01 },
  noise: { min: 0, max: 1, step: 0.01 },
  frequency: { min: 50, max: 6400, step: 10 },
  detuneCents: { min: -2400, max: 2400, step: 10 },
  layerStartMs: { min: 0, max: 1800, step: 5 },
  layerDurationMs: { min: 30, max: 1800, step: 5 },
  vibratoDepth: { min: 0, max: 180, step: 1 },
  vibratoRate: { min: 0, max: 24, step: 0.1 },
  transient: { min: 0, max: 1, step: 0.01 },
  attackMs: { min: 0, max: 240, step: 1 },
  holdMs: { min: 0, max: 400, step: 1 },
  decayMs: { min: 10, max: 1000, step: 5 },
  sustain: { min: 0, max: 1, step: 0.01 },
  releaseMs: { min: 0, max: 1200, step: 5 },
  cutoffHz: { min: 80, max: 18000, step: 10 },
  resonance: { min: 0.2, max: 12, step: 0.1 },
  envelopeAmount: { min: -3, max: 3, step: 0.1 },
} as const

export function createStudioEnvelope(overrides: Partial<StudioEnvelope> = {}): StudioEnvelope {
  return clampStudioEnvelope({
    attackMs: 0,
    holdMs: 0,
    decayMs: 140,
    sustain: 0.35,
    releaseMs: 120,
    ...overrides,
  })
}

export function createStudioFilter(overrides: Partial<StudioFilter> = {}): StudioFilter {
  return clampStudioFilter({
    type: 'lowpass',
    cutoffHz: 9000,
    resonance: 0.7,
    envelopeAmount: 0.4,
    ...overrides,
  })
}

export function createStudioLayer(id: string, name: string, overrides: Partial<StudioLayer> = {}): StudioLayer {
  const baseLayer: StudioLayer = {
    id,
    name,
    enabled: true,
    solo: false,
    waveform: 'triangle',
    gain: 0.5,
    pan: 0,
    noise: 0.1,
    startFreq: 780,
    endFreq: 240,
    detuneCents: 0,
    startMs: 0,
    durationMs: 220,
    vibratoDepth: 0,
    vibratoRate: 0,
    transient: 0.28,
    envelope: createStudioEnvelope(),
    filter: createStudioFilter(),
  }

  return clampStudioLayer({
    ...baseLayer,
    ...overrides,
    envelope: createStudioEnvelope({ ...baseLayer.envelope, ...overrides.envelope }),
    filter: createStudioFilter({ ...baseLayer.filter, ...overrides.filter }),
  })
}

export function createStudioMasterSettings(
  overrides: Partial<StudioMasterSettings> = {},
): StudioMasterSettings {
  return clampStudioMasterSettings({
    gain: 0.9,
    drive: 0.14,
    delayMix: 0.08,
    delayMs: 120,
    delayFeedback: 0.24,
    stereoWidth: 1,
    ...overrides,
  })
}

export function createStudioPatch(overrides: Partial<StudioPatch> = {}): StudioPatch {
  const fallbackLayer = createStudioLayer('layer-1', 'Body')
  const basePatch: StudioPatch = {
    id: 'studio-patch',
    name: 'Untitled Patch',
    description: 'Layered patch ready for advanced one-shot design.',
    durationMs: 480,
    master: createStudioMasterSettings(),
    layers: [fallbackLayer],
  }
  const layers =
    overrides.layers?.map((layer, index) =>
      createStudioLayer(layer.id ?? `layer-${index + 1}`, layer.name ?? `Layer ${index + 1}`, layer),
    ) ?? basePatch.layers

  return clampStudioPatch({
    ...basePatch,
    ...overrides,
    master: createStudioMasterSettings({ ...basePatch.master, ...overrides.master }),
    layers,
  })
}

export function cloneStudioPatch(patch: StudioPatch): StudioPatch {
  return createStudioPatch(JSON.parse(JSON.stringify(patch)) as StudioPatch)
}

export function clampStudioEnvelope(envelope: StudioEnvelope): StudioEnvelope {
  return {
    attackMs: clampValue(envelope.attackMs, STUDIO_LIMITS.attackMs.min, STUDIO_LIMITS.attackMs.max),
    holdMs: clampValue(envelope.holdMs, STUDIO_LIMITS.holdMs.min, STUDIO_LIMITS.holdMs.max),
    decayMs: clampValue(envelope.decayMs, STUDIO_LIMITS.decayMs.min, STUDIO_LIMITS.decayMs.max),
    sustain: clampValue(envelope.sustain, STUDIO_LIMITS.sustain.min, STUDIO_LIMITS.sustain.max),
    releaseMs: clampValue(envelope.releaseMs, STUDIO_LIMITS.releaseMs.min, STUDIO_LIMITS.releaseMs.max),
  }
}

export function clampStudioFilter(filter: StudioFilter): StudioFilter {
  return {
    type: filter.type,
    cutoffHz: clampValue(filter.cutoffHz, STUDIO_LIMITS.cutoffHz.min, STUDIO_LIMITS.cutoffHz.max),
    resonance: clampValue(
      filter.resonance,
      STUDIO_LIMITS.resonance.min,
      STUDIO_LIMITS.resonance.max,
    ),
    envelopeAmount: clampValue(
      filter.envelopeAmount,
      STUDIO_LIMITS.envelopeAmount.min,
      STUDIO_LIMITS.envelopeAmount.max,
    ),
  }
}

export function clampStudioLayer(layer: StudioLayer): StudioLayer {
  return {
    ...layer,
    gain: clampValue(layer.gain, STUDIO_LIMITS.layerGain.min, STUDIO_LIMITS.layerGain.max),
    pan: clampValue(layer.pan, STUDIO_LIMITS.pan.min, STUDIO_LIMITS.pan.max),
    noise: clampValue(layer.noise, STUDIO_LIMITS.noise.min, STUDIO_LIMITS.noise.max),
    startFreq: clampValue(
      layer.startFreq,
      STUDIO_LIMITS.frequency.min,
      STUDIO_LIMITS.frequency.max,
    ),
    endFreq: clampValue(layer.endFreq, STUDIO_LIMITS.frequency.min, STUDIO_LIMITS.frequency.max),
    detuneCents: clampValue(
      layer.detuneCents,
      STUDIO_LIMITS.detuneCents.min,
      STUDIO_LIMITS.detuneCents.max,
    ),
    startMs: clampValue(layer.startMs, STUDIO_LIMITS.layerStartMs.min, STUDIO_LIMITS.layerStartMs.max),
    durationMs: clampValue(
      layer.durationMs,
      STUDIO_LIMITS.layerDurationMs.min,
      STUDIO_LIMITS.layerDurationMs.max,
    ),
    vibratoDepth: clampValue(
      layer.vibratoDepth,
      STUDIO_LIMITS.vibratoDepth.min,
      STUDIO_LIMITS.vibratoDepth.max,
    ),
    vibratoRate: clampValue(
      layer.vibratoRate,
      STUDIO_LIMITS.vibratoRate.min,
      STUDIO_LIMITS.vibratoRate.max,
    ),
    transient: clampValue(layer.transient, STUDIO_LIMITS.transient.min, STUDIO_LIMITS.transient.max),
    envelope: clampStudioEnvelope(layer.envelope),
    filter: clampStudioFilter(layer.filter),
  }
}

export function clampStudioMasterSettings(master: StudioMasterSettings): StudioMasterSettings {
  return {
    gain: clampValue(master.gain, STUDIO_LIMITS.masterGain.min, STUDIO_LIMITS.masterGain.max),
    drive: clampValue(master.drive, STUDIO_LIMITS.drive.min, STUDIO_LIMITS.drive.max),
    delayMix: clampValue(master.delayMix, STUDIO_LIMITS.delayMix.min, STUDIO_LIMITS.delayMix.max),
    delayMs: clampValue(master.delayMs, STUDIO_LIMITS.delayMs.min, STUDIO_LIMITS.delayMs.max),
    delayFeedback: clampValue(
      master.delayFeedback,
      STUDIO_LIMITS.delayFeedback.min,
      STUDIO_LIMITS.delayFeedback.max,
    ),
    stereoWidth: clampValue(
      master.stereoWidth,
      STUDIO_LIMITS.stereoWidth.min,
      STUDIO_LIMITS.stereoWidth.max,
    ),
  }
}

export function clampStudioPatch(patch: StudioPatch): StudioPatch {
  const layers = patch.layers.slice(0, MAX_STUDIO_LAYERS).map(clampStudioLayer)

  return {
    ...patch,
    durationMs: clampValue(
      patch.durationMs,
      STUDIO_LIMITS.patchDurationMs.min,
      STUDIO_LIMITS.patchDurationMs.max,
    ),
    master: clampStudioMasterSettings(patch.master),
    layers: layers.length > 0 ? layers : [createStudioLayer('layer-1', 'Body')],
  }
}

export function varyStudioLayer(layer: StudioLayer, random: () => number = Math.random): StudioLayer {
  const drift = () => random() * 2 - 1
  const scaled = (value: number, amount: number, min: number, max: number) =>
    clampValue(value * (1 + drift() * amount), min, max)
  const shifted = (value: number, amount: number, min: number, max: number) =>
    clampValue(value + drift() * amount, min, max)

  return clampStudioLayer({
    ...layer,
    gain: shifted(layer.gain, 0.16, STUDIO_LIMITS.layerGain.min, STUDIO_LIMITS.layerGain.max),
    pan: shifted(layer.pan, 0.25, STUDIO_LIMITS.pan.min, STUDIO_LIMITS.pan.max),
    noise: shifted(layer.noise, 0.2, STUDIO_LIMITS.noise.min, STUDIO_LIMITS.noise.max),
    startFreq: scaled(layer.startFreq, 0.28, STUDIO_LIMITS.frequency.min, STUDIO_LIMITS.frequency.max),
    endFreq: scaled(layer.endFreq, 0.28, STUDIO_LIMITS.frequency.min, STUDIO_LIMITS.frequency.max),
    detuneCents: shifted(
      layer.detuneCents,
      160,
      STUDIO_LIMITS.detuneCents.min,
      STUDIO_LIMITS.detuneCents.max,
    ),
    durationMs: scaled(
      layer.durationMs,
      0.22,
      STUDIO_LIMITS.layerDurationMs.min,
      STUDIO_LIMITS.layerDurationMs.max,
    ),
    vibratoDepth: shifted(
      layer.vibratoDepth,
      20,
      STUDIO_LIMITS.vibratoDepth.min,
      STUDIO_LIMITS.vibratoDepth.max,
    ),
    vibratoRate: shifted(
      layer.vibratoRate,
      3.5,
      STUDIO_LIMITS.vibratoRate.min,
      STUDIO_LIMITS.vibratoRate.max,
    ),
    transient: shifted(layer.transient, 0.22, STUDIO_LIMITS.transient.min, STUDIO_LIMITS.transient.max),
    envelope: {
      attackMs: shifted(
        layer.envelope.attackMs,
        20,
        STUDIO_LIMITS.attackMs.min,
        STUDIO_LIMITS.attackMs.max,
      ),
      holdMs: shifted(layer.envelope.holdMs, 20, STUDIO_LIMITS.holdMs.min, STUDIO_LIMITS.holdMs.max),
      decayMs: scaled(layer.envelope.decayMs, 0.28, STUDIO_LIMITS.decayMs.min, STUDIO_LIMITS.decayMs.max),
      sustain: shifted(layer.envelope.sustain, 0.2, STUDIO_LIMITS.sustain.min, STUDIO_LIMITS.sustain.max),
      releaseMs: scaled(
        layer.envelope.releaseMs,
        0.28,
        STUDIO_LIMITS.releaseMs.min,
        STUDIO_LIMITS.releaseMs.max,
      ),
    },
    filter: {
      ...layer.filter,
      cutoffHz: scaled(layer.filter.cutoffHz, 0.25, STUDIO_LIMITS.cutoffHz.min, STUDIO_LIMITS.cutoffHz.max),
      resonance: shifted(
        layer.filter.resonance,
        1.6,
        STUDIO_LIMITS.resonance.min,
        STUDIO_LIMITS.resonance.max,
      ),
      envelopeAmount: shifted(
        layer.filter.envelopeAmount,
        0.8,
        STUDIO_LIMITS.envelopeAmount.min,
        STUDIO_LIMITS.envelopeAmount.max,
      ),
    },
  })
}
