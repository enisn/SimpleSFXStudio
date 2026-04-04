import { PRESETS } from '../presets'
import type { SoundPreset } from '../types'
import { createStudioLayer, createStudioPatch, type StudioPatch } from './types'

export function simplePresetToStudioPatch(preset: SoundPreset): StudioPatch {
  return createStudioPatch({
    id: `simple-${preset.id}`,
    name: `${preset.name} Studio`,
    description: `Imported from the landing page preset “${preset.name}” for layered editing.`,
    durationMs: Math.max(preset.params.durationMs + 180, 240),
    master: {
      gain: 0.92,
      drive: preset.params.transient * 0.18,
      delayMix: preset.category === 'rewards' ? 0.12 : 0.04,
      delayMs: preset.category === 'motion' ? 160 : 110,
      delayFeedback: preset.category === 'motion' ? 0.32 : 0.18,
      stereoWidth: preset.category === 'motion' ? 1.18 : 0.96,
    },
    layers: [
      createStudioLayer('import-body', 'Imported body', {
        waveform: preset.params.waveform,
        gain: Math.min(1.1, Math.max(0.16, preset.params.volume)),
        noise: preset.params.noise,
        startFreq: preset.params.startFreq,
        endFreq: preset.params.endFreq,
        durationMs: preset.params.durationMs,
        vibratoDepth: preset.params.vibratoDepth,
        vibratoRate: preset.params.vibratoRate,
        transient: preset.params.transient,
        envelope: {
          attackMs: preset.params.attackMs,
          holdMs: 0,
          decayMs: preset.params.decayMs,
          sustain: 0.12,
          releaseMs: Math.max(30, Math.round(preset.params.decayMs * 0.3)),
        },
        filter: {
          type: 'lowpass',
          cutoffHz: preset.params.lowPassHz,
          resonance: 0.9,
          envelopeAmount: 0.45,
        },
      }),
    ],
  })
}

export function getSimplePresetById(presetId: string | null) {
  if (!presetId) {
    return null
  }

  return PRESETS.find((preset) => preset.id === presetId) ?? null
}
