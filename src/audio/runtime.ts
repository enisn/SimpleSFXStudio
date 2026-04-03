import type { SoundParams } from './types'
import { encodeWav, renderSound } from './synthesis'

export interface PreviewPlaybackOptions {
  onEnded?: () => void
}

export interface PreviewTransport {
  play: (params: SoundParams, options?: PreviewPlaybackOptions) => Promise<void>
  stop: () => void
}

class BrowserPreviewTransport implements PreviewTransport {
  private audioContext: AudioContext | null = null
  private activeSource: AudioBufferSourceNode | null = null

  private async getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    return this.audioContext
  }

  async play(params: SoundParams, options: PreviewPlaybackOptions = {}) {
    const context = await this.getAudioContext()
    this.stop()

    const samples = renderSound(params, {
      sampleRate: context.sampleRate,
      seed: (Date.now() % 100000) + 1,
    })
    const buffer = context.createBuffer(1, samples.length, context.sampleRate)
    buffer.copyToChannel(samples, 0)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.onended = () => {
      if (this.activeSource !== source) {
        return
      }

      this.activeSource = null
      source.disconnect()
      options.onEnded?.()
    }

    this.activeSource = source
    source.start()
  }

  stop() {
    if (!this.activeSource) {
      return
    }

    const source = this.activeSource
    this.activeSource = null
    source.onended = null

    try {
      source.stop()
    } catch {
      // The source may already be stopped while rapid re-previewing.
    }

    source.disconnect()
  }
}

export const browserPreviewTransport = new BrowserPreviewTransport()

function createFileName(presetName: string, durationMs: number) {
  const slug = presetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `ui-${slug}-${Math.round(durationMs)}ms.wav`
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
