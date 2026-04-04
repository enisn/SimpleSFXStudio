import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { StudioPreviewTransport } from '../audio/studio/runtime'
import StudioPage from './StudioPage'

function createPreviewHarness() {
  let onEnded: (() => void) | undefined

  const transport: StudioPreviewTransport = {
    play: vi.fn(async (_patch, options) => {
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

describe('StudioPage', () => {
  it('imports a landing preset into the advanced studio route', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    render(
      <MemoryRouter initialEntries={['/studio?preset=click']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('Click Snap Studio')).toBeInTheDocument()
    })

    expect(screen.getByRole('status')).toHaveTextContent(/imported click snap/i)
    expect(screen.getAllByText(/imported body/i).length).toBeGreaterThan(0)
  })

  it('adds a new layer and previews the patch transport', async () => {
    const { transport, finishPlayback } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /add layer/i }))

    expect(screen.getByText(/3\/4/)).toBeInTheDocument()
    expect(screen.getAllByText(/layer 3/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /play patch/i }))

    expect(transport.play).toHaveBeenCalledTimes(1)

    finishPlayback()

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/ready to replay/i)
    })
  })

  it('deletes a specific layer from the layers panel', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /add layer/i }))

    const layerCards = screen.getAllByRole('button', { name: /delete/i })
    await user.click(layerCards[layerCards.length - 1]!)

    expect(screen.queryAllByText(/layer 3/i)).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(/removed layer 3/i)
    expect(within(screen.getByLabelText(/patch layers/i)).queryAllByText(/layer 3/i)).toHaveLength(0)
  })
})
