import type { Waveform } from '../types'
import { clampStudioPatch, type StudioFilterType, type StudioPatch } from './types'

const TAU = Math.PI * 2

export interface StudioRenderOptions {
  sampleRate?: number
  seed?: number
}

export interface StereoRenderResult {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

type FilterState = {
  ic1eq: number
  ic2eq: number
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

function getEnvelopeValue(
  elapsedSeconds: number,
  durationSeconds: number,
  envelope: StudioPatch['layers'][number]['envelope'],
) {
  if (elapsedSeconds < 0 || elapsedSeconds >= durationSeconds) {
    return 0
  }

  const attack = envelope.attackMs / 1000
  const hold = envelope.holdMs / 1000
  const decay = Math.max(envelope.decayMs / 1000, 0.0001)
  const release = envelope.releaseMs / 1000
  const releaseStart = Math.max(0, durationSeconds - release)

  if (attack > 0 && elapsedSeconds < attack) {
    return elapsedSeconds / attack
  }

  if (elapsedSeconds < attack + hold) {
    return 1
  }

  const afterHold = elapsedSeconds - attack - hold

  if (afterHold < decay) {
    const progress = afterHold / decay
    return 1 + (envelope.sustain - 1) * progress
  }

  if (elapsedSeconds < releaseStart || release === 0) {
    return envelope.sustain
  }

  const releaseProgress = Math.min(1, (elapsedSeconds - releaseStart) / Math.max(release, 0.0001))
  return envelope.sustain * (1 - releaseProgress)
}

function processFilter(
  sample: number,
  type: StudioFilterType,
  cutoffHz: number,
  resonance: number,
  sampleRate: number,
  state: FilterState,
) {
  if (type === 'none') {
    return sample
  }

  const normalizedCutoff = Math.max(20, Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate
  const g = Math.tan(Math.PI * normalizedCutoff)
  const k = 1 / Math.max(0.2, resonance)
  const a1 = 1 / (1 + g * (g + k))
  const a2 = g * a1
  const a3 = g * a2
  const v3 = sample - state.ic2eq
  const v1 = a1 * state.ic1eq + a2 * v3
  const v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3

  state.ic1eq = 2 * v1 - state.ic1eq
  state.ic2eq = 2 * v2 - state.ic2eq

  const low = v2
  const high = sample - k * v1 - v2
  const band = v1

  switch (type) {
    case 'highpass':
      return high
    case 'bandpass':
      return band
    case 'lowpass':
    default:
      return low
  }
}

export function renderStudioPatch(
  input: StudioPatch,
  options: StudioRenderOptions = {},
): StereoRenderResult {
  const patch = clampStudioPatch(input)
  const sampleRate = options.sampleRate ?? 44100
  const durationSeconds = patch.durationMs / 1000
  const frameCount = Math.max(1, Math.round(durationSeconds * sampleRate))
  const random = createRandom(options.seed ?? 1)
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  const soloLayers = patch.layers.filter((layer) => layer.solo && layer.enabled)
  const activeLayers = soloLayers.length > 0 ? soloLayers : patch.layers.filter((layer) => layer.enabled)

  for (const layer of activeLayers) {
    const startFrame = Math.round((layer.startMs / 1000) * sampleRate)
    const layerDurationSeconds = layer.durationMs / 1000
    const layerFrames = Math.max(1, Math.round(layerDurationSeconds * sampleRate))
    const detuneRatio = Math.pow(2, layer.detuneCents / 1200)
    const ratio = layer.endFreq / layer.startFreq
    const filterState: FilterState = { ic1eq: 0, ic2eq: 0 }
    let phase = 0

    for (let frame = 0; frame < layerFrames; frame += 1) {
      const index = startFrame + frame

      if (index >= frameCount) {
        break
      }

      const localTime = frame / sampleRate
      const progress = layerFrames === 1 ? 1 : frame / (layerFrames - 1)
      let frequency = layer.startFreq * Math.pow(ratio, progress) * detuneRatio

      if (layer.vibratoDepth > 0 && layer.vibratoRate > 0) {
        frequency += Math.sin(TAU * layer.vibratoRate * localTime) * layer.vibratoDepth
      }

      frequency = Math.max(20, frequency)
      phase += TAU * frequency / sampleRate

      if (phase > TAU) {
        phase %= TAU
      }

      const tone = oscillator(phase, layer.waveform)
      const noise = random() * 2 - 1
      const envelope = getEnvelopeValue(localTime, layerDurationSeconds, layer.envelope)
      const cutoff = layer.filter.cutoffHz * Math.pow(2, layer.filter.envelopeAmount * envelope)
      const transient = layer.transient * Math.exp(-42 * localTime) * (tone * 0.7 + noise * 0.3)
      const blended = tone * (1 - layer.noise) + noise * layer.noise
      const filtered = processFilter(
        (blended + transient) * envelope * layer.gain,
        layer.filter.type,
        cutoff,
        layer.filter.resonance,
        sampleRate,
        filterState,
      )
      const pan = Math.max(-1, Math.min(1, layer.pan * patch.master.stereoWidth))
      const leftGain = Math.sqrt((1 - pan) * 0.5)
      const rightGain = Math.sqrt((1 + pan) * 0.5)

      left[index] += filtered * leftGain
      right[index] += filtered * rightGain
    }
  }

  const driveAmount = 1 + patch.master.drive * 6
  const delaySamples = Math.max(1, Math.round((patch.master.delayMs / 1000) * sampleRate))
  const delayLeft = new Float32Array(delaySamples)
  const delayRight = new Float32Array(delaySamples)

  for (let index = 0; index < frameCount; index += 1) {
    const dryLeft = Math.tanh(left[index] * driveAmount) * patch.master.gain
    const dryRight = Math.tanh(right[index] * driveAmount) * patch.master.gain
    const delayIndex = index % delaySamples
    const delayedLeft = delayLeft[delayIndex] ?? 0
    const delayedRight = delayRight[delayIndex] ?? 0
    const mixedLeft = dryLeft * (1 - patch.master.delayMix) + delayedLeft * patch.master.delayMix
    const mixedRight = dryRight * (1 - patch.master.delayMix) + delayedRight * patch.master.delayMix

    delayLeft[delayIndex] = dryLeft + delayedLeft * patch.master.delayFeedback
    delayRight[delayIndex] = dryRight + delayedRight * patch.master.delayFeedback
    left[index] = Math.max(-1, Math.min(1, mixedLeft))
    right[index] = Math.max(-1, Math.min(1, mixedRight))
  }

  return { left, right, sampleRate }
}

export function mixStereoForDisplay(result: StereoRenderResult) {
  const samples = new Float32Array(result.left.length)

  for (let index = 0; index < result.left.length; index += 1) {
    samples[index] = ((result.left[index] ?? 0) + (result.right[index] ?? 0)) * 0.5
  }

  return samples
}

export function encodeStereoWav(result: StereoRenderResult) {
  const channelCount = 2
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + result.left.length * channelCount * bytesPerSample)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + result.left.length * channelCount * bytesPerSample, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, result.sampleRate, true)
  view.setUint32(28, result.sampleRate * channelCount * bytesPerSample, true)
  view.setUint16(32, channelCount * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, result.left.length * channelCount * bytesPerSample, true)

  for (let index = 0; index < result.left.length; index += 1) {
    writePcmSample(view, 44 + index * 4, result.left[index] ?? 0)
    writePcmSample(view, 46 + index * 4, result.right[index] ?? 0)
  }

  return buffer
}

function writePcmSample(view: DataView, offset: number, value: number) {
  const sample = Math.max(-1, Math.min(1, value))
  view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true)
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}
