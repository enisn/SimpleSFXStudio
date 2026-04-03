import type { SoundParams } from './types'
import { encodeWav, renderSound } from './synthesis'

let audioContext: AudioContext | null = null

async function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  return audioContext
}

function createFileName(presetName: string, durationMs: number) {
  const slug = presetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `ui-${slug}-${Math.round(durationMs)}ms.wav`
}

export async function previewSound(params: SoundParams) {
  const context = await getAudioContext()
  const samples = renderSound(params, {
    sampleRate: context.sampleRate,
    seed: (Date.now() % 100000) + 1,
  })
  const buffer = context.createBuffer(1, samples.length, context.sampleRate)
  buffer.copyToChannel(samples, 0)

  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
}

export function downloadSound(params: SoundParams, presetName: string) {
  const sampleRate = 44100
  const samples = renderSound(params, { sampleRate, seed: 23 })
  const wavBuffer = encodeWav(samples, sampleRate)
  const blob = new Blob([wavBuffer], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = createFileName(presetName, params.durationMs)
  link.click()
  URL.revokeObjectURL(url)
}
