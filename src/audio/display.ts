import type { Waveform } from './types'

export function formatMilliseconds(value: number) {
  return `${Math.round(value)} ms`
}

export function formatFrequency(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} kHz`
  }

  return `${Math.round(value)} Hz`
}

export function formatWaveformLabel(waveform: Waveform) {
  return waveform.charAt(0).toUpperCase() + waveform.slice(1)
}

export function toWaveformPath(samples: Float32Array, width: number, height: number) {
  const center = height / 2
  const amplitude = height * 0.38
  const points = Math.max(2, Math.floor(width))
  const stride = Math.max(1, Math.floor(samples.length / points))
  const coordinates: string[] = []

  for (let index = 0; index < points; index += 1) {
    const sampleIndex = Math.min(samples.length - 1, index * stride)
    const sample = samples[sampleIndex] ?? 0
    const x = ((points === 1 ? 0 : index / (points - 1)) * width).toFixed(2)
    const y = (center - sample * amplitude).toFixed(2)
    coordinates.push(`${index === 0 ? 'M' : 'L'}${x} ${y}`)
  }

  return coordinates.join(' ')
}
