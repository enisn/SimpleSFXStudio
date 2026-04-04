import { encodeStereoWav, renderStudioPatch } from './synthesis'
import type { StudioPatch } from './types'

export interface StudioPreviewPlaybackOptions {
  onEnded?: () => void
}

export interface StudioPreviewTransport {
  play: (patch: StudioPatch, options?: StudioPreviewPlaybackOptions) => Promise<void>
  stop: () => void
}

class BrowserStudioPreviewTransport implements StudioPreviewTransport {
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

  async play(patch: StudioPatch, options: StudioPreviewPlaybackOptions = {}) {
    const context = await this.getAudioContext()
    this.stop()

    const render = renderStudioPatch(patch, {
      sampleRate: context.sampleRate,
      seed: (Date.now() % 100000) + 1,
    })
    const buffer = context.createBuffer(2, render.left.length, context.sampleRate)
    buffer.copyToChannel(new Float32Array(render.left), 0)
    buffer.copyToChannel(new Float32Array(render.right), 1)

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
      // The source may already be stopped during quick re-triggering.
    }

    source.disconnect()
  }
}

export const browserStudioPreviewTransport = new BrowserStudioPreviewTransport()

function createStudioFileName(patchName: string) {
  const slug = patchName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `studio-${slug || 'patch'}.wav`
}

export function downloadStudioPatch(patch: StudioPatch) {
  const render = renderStudioPatch(patch, { sampleRate: 44100, seed: 23 })
  const wavBuffer = encodeStereoWav(render)
  const blob = new Blob([wavBuffer], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = createStudioFileName(patch.name)
  link.click()
  URL.revokeObjectURL(url)
}
