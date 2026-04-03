import { clampSoundParams, type SoundParams, type Waveform } from './types'

const TAU = Math.PI * 2

export interface RenderOptions {
  sampleRate?: number
  seed?: number
}

function createRandom(seed = 1) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function oscillator(phase: number, waveform: Waveform) {
  switch (waveform) {
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase))
    case 'square':
      return Math.sign(Math.sin(phase)) || 1
    case 'sawtooth':
      return 2 * (phase / TAU - Math.floor(phase / TAU + 0.5))
    case 'sine':
    default:
      return Math.sin(phase)
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1
  }

  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return amount * amount * (3 - 2 * amount)
}

export function renderSound(input: SoundParams, options: RenderOptions = {}) {
  const params = clampSoundParams(input)
  const sampleRate = options.sampleRate ?? 44100
  const durationSeconds = params.durationMs / 1000
  const frameCount = Math.max(1, Math.round(durationSeconds * sampleRate))
  const attackSeconds = params.attackMs / 1000
  const decaySeconds = Math.max(params.decayMs / 1000, 0.001)
  const seed = options.seed ?? 1
  const random = createRandom(seed)
  const samples = new Float32Array(frameCount)
  const ratio = params.endFreq / params.startFreq
  const maxCutoff = sampleRate * 0.45
  const cutoff = Math.min(params.lowPassHz, maxCutoff)
  const lowPassAlpha = cutoff >= maxCutoff ? 1 : (1 / sampleRate) / ((1 / (TAU * cutoff)) + 1 / sampleRate)
  let filtered = 0
  let phase = 0

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate
    const progress = frameCount === 1 ? 1 : index / (frameCount - 1)
    let frequency = params.startFreq * Math.pow(ratio, progress)

    if (params.vibratoDepth > 0 && params.vibratoRate > 0) {
      frequency += Math.sin(TAU * params.vibratoRate * time) * params.vibratoDepth
    }

    frequency = Math.max(20, frequency)
    phase += TAU * frequency / sampleRate

    if (phase > TAU) {
      phase %= TAU
    }

    const tone = oscillator(phase, params.waveform)
    const noise = random() * 2 - 1
    const attack = attackSeconds === 0 ? 1 : Math.min(1, time / attackSeconds)
    const decay = Math.exp((-6 * Math.max(0, time - attackSeconds)) / decaySeconds)
    const fadeOut = 1 - smoothstep(durationSeconds * 0.82, durationSeconds, time)
    const transient = params.transient * Math.exp(-48 * time) * (tone * 0.65 + noise * 0.35)
    const blend = tone * (1 - params.noise) + noise * params.noise
    const rawSample = (blend + transient) * attack * decay * fadeOut * params.volume
    filtered += lowPassAlpha * (rawSample - filtered)
    samples[index] = Math.tanh(filtered * 1.4)
  }

  return samples
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
  }

  return buffer
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}
