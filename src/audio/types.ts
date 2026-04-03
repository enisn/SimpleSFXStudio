export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth'
export type PresetCategory = 'buttons' | 'feedback' | 'alerts' | 'motion' | 'rewards'

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  buttons: 'Buttons',
  feedback: 'Feedback',
  alerts: 'Alerts',
  motion: 'Motion',
  rewards: 'Rewards',
}

export interface SoundParams {
  durationMs: number
  startFreq: number
  endFreq: number
  volume: number
  noise: number
  attackMs: number
  decayMs: number
  vibratoDepth: number
  vibratoRate: number
  lowPassHz: number
  transient: number
  waveform: Waveform
}

export interface SoundPreset {
  id: string
  name: string
  category: PresetCategory
  tag: string
  description: string
  params: SoundParams
}

export const SOUND_LIMITS = {
  durationMs: { min: 30, max: 900, step: 5 },
  startFreq: { min: 80, max: 3200, step: 10 },
  endFreq: { min: 60, max: 3200, step: 10 },
  volume: { min: 0.05, max: 1, step: 0.01 },
  noise: { min: 0, max: 1, step: 0.01 },
  attackMs: { min: 0, max: 120, step: 1 },
  decayMs: { min: 20, max: 900, step: 5 },
  vibratoDepth: { min: 0, max: 120, step: 1 },
  vibratoRate: { min: 0, max: 18, step: 0.1 },
  lowPassHz: { min: 400, max: 16000, step: 100 },
  transient: { min: 0, max: 1, step: 0.01 },
} as const

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function clampSoundParams(params: SoundParams): SoundParams {
  return {
    durationMs: clampValue(params.durationMs, SOUND_LIMITS.durationMs.min, SOUND_LIMITS.durationMs.max),
    startFreq: clampValue(params.startFreq, SOUND_LIMITS.startFreq.min, SOUND_LIMITS.startFreq.max),
    endFreq: clampValue(params.endFreq, SOUND_LIMITS.endFreq.min, SOUND_LIMITS.endFreq.max),
    volume: clampValue(params.volume, SOUND_LIMITS.volume.min, SOUND_LIMITS.volume.max),
    noise: clampValue(params.noise, SOUND_LIMITS.noise.min, SOUND_LIMITS.noise.max),
    attackMs: clampValue(params.attackMs, SOUND_LIMITS.attackMs.min, SOUND_LIMITS.attackMs.max),
    decayMs: clampValue(params.decayMs, SOUND_LIMITS.decayMs.min, SOUND_LIMITS.decayMs.max),
    vibratoDepth: clampValue(
      params.vibratoDepth,
      SOUND_LIMITS.vibratoDepth.min,
      SOUND_LIMITS.vibratoDepth.max,
    ),
    vibratoRate: clampValue(params.vibratoRate, SOUND_LIMITS.vibratoRate.min, SOUND_LIMITS.vibratoRate.max),
    lowPassHz: clampValue(params.lowPassHz, SOUND_LIMITS.lowPassHz.min, SOUND_LIMITS.lowPassHz.max),
    transient: clampValue(params.transient, SOUND_LIMITS.transient.min, SOUND_LIMITS.transient.max),
    waveform: params.waveform,
  }
}
