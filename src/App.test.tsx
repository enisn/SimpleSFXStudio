import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PreviewTransport } from './audio/runtime'

function createPreviewHarness() {
  let onEnded: (() => void) | undefined

  const transport: PreviewTransport = {
    play: vi.fn(async (_params, options) => {
      onEnded = options?.onEnded
    }),
    stop: vi.fn(),
  }

  return {
    transport,
    finishPlayback() {
      onEnded?.()
    },
  }
}

describe('App', () => {
  it('auto-previews when a preset is selected', async () => {
    const { transport, finishPlayback } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App previewTransport={transport} save={save} />)

    await user.click(screen.getByRole('button', { name: /error buzz/i }))

    expect(transport.play).toHaveBeenCalledTimes(1)
    expect(transport.play).toHaveBeenCalledWith(
      expect.objectContaining({ waveform: 'square', durationMs: 300 }),
      expect.any(Object),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/playing error buzz/i)

    finishPlayback()

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/ready to replay error buzz/i)
    })
  })

  it('uses the sticky transport to play and stop the current sound', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App previewTransport={transport} save={save} />)

    await user.click(screen.getByRole('button', { name: /play sound/i }))

    expect(transport.play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /stop sound/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /stop sound/i }))

    expect(transport.stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent(/stopped click snap/i)
  })

  it('replays after slider release instead of every change by default', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    render(<App previewTransport={transport} save={save} />)

    const durationSlider = screen.getByRole('slider', { name: /duration/i })
    fireEvent.change(durationSlider, { target: { value: '120' } })

    expect(transport.play).not.toHaveBeenCalled()

    fireEvent.pointerUp(durationSlider)

    expect(transport.play).toHaveBeenCalledTimes(1)
    expect(transport.play).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 120 }),
      expect.any(Object),
    )
  })

  it('switches waveform with one click using chips', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App previewTransport={transport} save={save} />)

    await user.click(screen.getByRole('button', { name: /square/i }))

    expect(transport.play).toHaveBeenCalledTimes(1)
    expect(transport.play).toHaveBeenCalledWith(
      expect.objectContaining({ waveform: 'square' }),
      expect.any(Object),
    )
    expect(screen.getByRole('button', { name: /square/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('updates the page theme when dark mode is selected', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App previewTransport={transport} save={save} />)

    await user.click(screen.getByRole('button', { name: /dark/i }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('soundmaker-theme')).toBe('dark')
  })

  it('exports the selected preset as a wav file', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App previewTransport={transport} save={save} />)

    await user.click(screen.getByRole('button', { name: /sparkle tick/i }))
    await user.click(screen.getByRole('button', { name: /export wav/i }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.any(Object), 'Sparkle Tick')
    expect(screen.getByRole('status')).toHaveTextContent(/downloaded sparkle tick/i)
  })
})
