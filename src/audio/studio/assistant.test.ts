import { describe, expect, it } from 'vitest'
import { applyAssistantOperations } from './assistant'
import { STUDIO_PATCHES } from './presets'
import { cloneStudioPatch } from './types'

describe('applyAssistantOperations', () => {
  it('updates master and selected layer settings from assistant operations', () => {
    const patch = cloneStudioPatch(STUDIO_PATCHES[0])
    const selectedLayerId = patch.layers[0].id

    const result = applyAssistantOperations(patch, selectedLayerId, [
      {
        type: 'set_master',
        changes: {
          stereoWidth: 1.3,
          delayMix: 0.2,
        },
      },
      {
        type: 'update_layer',
        layerId: 'selected',
        changes: {
          waveform: 'square',
          pan: 0.24,
          envelope: {
            attackMs: 9,
          },
          filter: {
            type: 'bandpass',
            cutoffHz: 2400,
          },
        },
      },
    ])

    const updatedLayer = result.patch.layers.find((layer) => layer.id === result.selectedLayerId)

    expect(result.didChange).toBe(true)
    expect(result.appliedCount).toBe(2)
    expect(result.patch.master.stereoWidth).toBe(1.3)
    expect(result.patch.master.delayMix).toBe(0.2)
    expect(updatedLayer).toEqual(
      expect.objectContaining({
        waveform: 'square',
        pan: 0.24,
      }),
    )
    expect(updatedLayer?.envelope.attackMs).toBe(9)
    expect(updatedLayer?.filter.type).toBe('bandpass')
    expect(updatedLayer?.filter.cutoffHz).toBe(2400)
  })

  it('replaces the patch from scratch and keeps the requested selected layer', () => {
    const patch = cloneStudioPatch(STUDIO_PATCHES[1])

    const result = applyAssistantOperations(patch, patch.layers[0].id, [
      {
        type: 'replace_patch',
        selectLayerId: 'tone',
        patch: {
          name: 'Fresh Laser Ping',
          description: 'Bright sci-fi ping built from scratch.',
          durationMs: 420,
          master: {
            gain: 0.82,
            stereoWidth: 1.12,
          },
          layers: [
            {
              id: 'tone',
              name: 'Tone',
              waveform: 'triangle',
              startFreq: 1620,
              endFreq: 520,
              durationMs: 180,
            },
            {
              id: 'air',
              name: 'Air',
              waveform: 'sawtooth',
              noise: 0.38,
              startMs: 10,
              durationMs: 150,
            },
          ],
        },
      },
    ])

    expect(result.patch.name).toBe('Fresh Laser Ping')
    expect(result.patch.description).toBe('Bright sci-fi ping built from scratch.')
    expect(result.patch.layers).toHaveLength(2)
    expect(result.selectedLayerId).toBe('tone')
    expect(result.patch.layers[0].id).toBe('tone')
    expect(result.patch.master.gain).toBe(0.82)
  })
})
