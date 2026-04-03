import { describe, expect, it } from 'vitest'
import { encodeWav, renderSound } from './synthesis'
import { PRESETS } from './presets'

describe('renderSound', () => {
  it('creates the expected number of samples and fades out cleanly', () => {
    const params = { ...PRESETS[0].params, durationMs: 120 }
    const samples = renderSound(params, { sampleRate: 1000, seed: 7 })
    const peak = Math.max(...samples)
    const floor = Math.min(...samples)

    expect(samples).toHaveLength(120)
    expect(peak).toBeLessThanOrEqual(1)
    expect(floor).toBeGreaterThanOrEqual(-1)
    expect(Math.abs(samples[samples.length - 1] ?? 1)).toBeLessThan(0.02)
  })

  it('is deterministic when the same seed is used', () => {
    const first = renderSound(PRESETS[5].params, { sampleRate: 2000, seed: 11 })
    const second = renderSound(PRESETS[5].params, { sampleRate: 2000, seed: 11 })

    expect(Array.from(first.slice(0, 24))).toEqual(Array.from(second.slice(0, 24)))
  })
})

describe('encodeWav', () => {
  it('writes a valid mono 16-bit wav header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0])
    const view = new DataView(encodeWav(samples, 44100))
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))

    expect(riff).toBe('RIFF')
    expect(wave).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
  })
})
