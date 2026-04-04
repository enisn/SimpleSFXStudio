import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function mockTimelineRulerWidth(container: HTMLElement, width = 400) {
  const ruler = container.querySelector('.studio-timeline-ruler') as HTMLDivElement | null

  expect(ruler).not.toBeNull()

  if (!ruler) {
    throw new Error('Timeline ruler is missing.')
  }

  Object.defineProperty(ruler, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height: 54,
      top: 0,
      right: width,
      bottom: 54,
      left: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {}
      },
    }),
  })
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

    expect(screen.getByText(/3 layers\. drag clips to move them\./i)).toBeInTheDocument()
    expect(screen.getAllByText(/layer 3/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /play patch/i }))

    expect(transport.play).toHaveBeenCalledTimes(1)

    finishPlayback()

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/ready to replay/i)
    })
  })

  it('renders layers inside the timeline editor', async () => {
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

    expect(screen.getByRole('heading', { name: /final waveform/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /layer timeline/i })).toHaveTextContent(/layer 3/i)
    expect(screen.getByRole('button', { name: /timeline track for layer 3/i })).toBeInTheDocument()
  })

  it('keeps layers inside the patch length when duration is reduced', async () => {
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
    await user.click(screen.getByRole('tab', { name: /master/i }))

    fireEvent.change(screen.getByLabelText(/patch duration/i), { target: { value: '120' } })

    expect(screen.getAllByLabelText(/start time for/i)[0]).toHaveValue(0)
  })

  it('lets the start time be edited precisely from the timeline head', () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    const startInput = screen.getAllByLabelText(/start time for/i)[0]

    fireEvent.change(startInput, { target: { value: '1' } })

    expect(startInput).toHaveValue(1)
  })

  it('previews after dragging a timeline clip', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    const { container } = render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    const clip = container.querySelector('.studio-timeline-track-clip') as HTMLDivElement | null

    expect(clip).not.toBeNull()
    mockTimelineRulerWidth(container)

    if (!clip) {
      throw new Error('Timeline clip is missing.')
    }

    fireEvent.pointerDown(clip, { clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 100 })
    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(transport.play).toHaveBeenCalledTimes(1)
    })
  })

  it('previews after resizing a timeline clip', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    const { container } = render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    const handle = container.querySelector('.studio-timeline-track-clip__handle') as HTMLDivElement | null

    expect(handle).not.toBeNull()
    mockTimelineRulerWidth(container)

    if (!handle) {
      throw new Error('Timeline resize handle is missing.')
    }

    fireEvent.pointerDown(handle, { clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 100 })
    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(transport.play).toHaveBeenCalledTimes(1)
    })
  })

  it('clears timeline drag state when a pointer interaction is cancelled', () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    const { container } = render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    const clip = container.querySelector('.studio-timeline-track-clip') as HTMLDivElement | null

    expect(clip).not.toBeNull()
    mockTimelineRulerWidth(container)

    if (!clip) {
      throw new Error('Timeline clip is missing.')
    }

    fireEvent.pointerDown(clip, { clientX: 0 })

    expect(document.body.dataset.timelineDrag).toBe('move')

    fireEvent.pointerCancel(window)

    expect(document.body.dataset.timelineDrag).toBeUndefined()

    fireEvent.pointerMove(window, { clientX: 120 })
    fireEvent.pointerUp(window)

    expect(transport.play).not.toHaveBeenCalled()
  })

  it('collapses and re-expands the side panels from their rails', async () => {
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

    await user.click(screen.getByRole('button', { name: /collapse source browser/i }))

    expect(screen.queryByRole('heading', { name: /patch browser/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expand source browser/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await user.click(screen.getByRole('button', { name: /collapse inspector/i }))

    expect(screen.queryByRole('heading', { name: /body/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expand inspector/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await user.click(screen.getByRole('button', { name: /expand source browser/i }))
    await user.click(screen.getByRole('tab', { name: /master inspector/i }))

    expect(screen.getByRole('heading', { name: /patch browser/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /patch bus/i })).toBeInTheDocument()
  })

  it('warns before loading a browser preset when the patch was modified', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /add layer/i }))

    const sourceCards = within(screen.getByLabelText(/studio patch browser/i)).getAllByRole('button')
    await user.click(sourceCards[0])

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group', { name: /layer timeline/i })).toHaveTextContent(/layer 3/i)

    confirmSpy.mockRestore()
  })

  it('supports duplicate and delete keyboard shortcuts for the selected layer', async () => {
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
    await user.click(screen.getByRole('button', { name: /select layer 3 in timeline/i }))

    fireEvent.keyDown(window, { code: 'KeyD', key: 'd' })

    expect(screen.getByRole('group', { name: /layer timeline/i })).toHaveTextContent(/layer 3 copy/i)

    fireEvent.keyDown(window, { code: 'Delete', key: 'Delete' })

    expect(screen.getByRole('group', { name: /layer timeline/i })).not.toHaveTextContent(/layer 3 copy/i)
  })

  it('deletes a specific layer from the timeline actions', async () => {
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

    await user.click(screen.getByRole('button', { name: /select layer 3 in timeline/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/removed layer 3/i)
    expect(screen.getByRole('group', { name: /layer timeline/i })).not.toHaveTextContent(/layer 3/i)
  })
})
