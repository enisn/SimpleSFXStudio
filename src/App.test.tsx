import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('switches presets and previews the current sound', async () => {
    const preview = vi.fn()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App preview={preview} save={save} />)

    await user.click(screen.getByRole('button', { name: /error buzz/i }))
    await user.click(screen.getByRole('button', { name: /preview sound/i }))

    expect(screen.getByRole('heading', { name: /error buzz/i })).toBeInTheDocument()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ waveform: 'square', durationMs: 300 }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/played error buzz/i)
  })

  it('exports the selected preset as a wav file', async () => {
    const preview = vi.fn()
    const save = vi.fn()
    const user = userEvent.setup()

    render(<App preview={preview} save={save} />)

    await user.click(screen.getByRole('button', { name: /sparkle tick/i }))
    await user.click(screen.getByRole('button', { name: /export wav/i }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.any(Object), 'Sparkle Tick')
    expect(screen.getByRole('status')).toHaveTextContent(/downloaded sparkle tick/i)
  })
})
