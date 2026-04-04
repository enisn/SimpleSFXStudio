import { describe, expect, it } from 'vitest'
import { PRESETS } from '../presets'
import { simplePresetToStudioPatch } from './adapters'
import { STUDIO_PATCHES } from './presets'
import { encodeStereoWav, renderStudioPatch } from './synthesis'

describe('simplePresetToStudioPatch', () => {
  it('keeps the imported preset waveform and pitch sweep', () => {
    const patch = simplePresetToStudioPatch(PRESETS[0])
    const layer = patch.layers[0]

    expect(layer?.waveform).toBe(PRESETS[0].params.waveform)
    expect(layer?.startFreq).toBe(PRESETS[0].params.startFreq)
    expect(layer?.endFreq).toBe(PRESETS[0].params.endFreq)
  })
})

describe('renderStudioPatch', () => {
  it('renders bounded stereo samples deterministically with a seed', () => {
    const first = renderStudioPatch(STUDIO_PATCHES[1], { sampleRate: 2200, seed: 11 })
    const second = renderStudioPatch(STUDIO_PATCHES[1], { sampleRate: 2200, seed: 11 })

    expect(first.left).toHaveLength(second.left.length)
    expect(first.right).toHaveLength(second.right.length)
    expect(Array.from(first.left.slice(0, 20))).toEqual(Array.from(second.left.slice(0, 20)))
    expect(Array.from(first.right.slice(0, 20))).toEqual(Array.from(second.right.slice(0, 20)))
    expect(Math.max(...first.left, ...first.right)).toBeLessThanOrEqual(1)
    expect(Math.min(...first.left, ...first.right)).toBeGreaterThanOrEqual(-1)
  })
})

describe('encodeStereoWav', () => {
  it('writes a valid stereo wav header', () => {
    const render = renderStudioPatch(STUDIO_PATCHES[0], { sampleRate: 4000, seed: 3 })
    const view = new DataView(encodeStereoWav(render))
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))

    expect(riff).toBe('RIFF')
    expect(wave).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(40, true)).toBe(render.left.length * 4)
  })
})
