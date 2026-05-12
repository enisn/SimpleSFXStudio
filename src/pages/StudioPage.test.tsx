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

    const { container } = render(
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

    const rightRail = container.querySelector('.studio-pane-rail--right')

    expect(rightRail).not.toBeNull()

    if (!rightRail) {
      throw new Error('Right inspector rail is missing.')
    }

    fireEvent.click(rightRail)

    expect(screen.queryByRole('heading', { name: /body/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^expand inspector panel$/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await user.click(screen.getByRole('button', { name: /expand source browser/i }))
    fireEvent.click(container.querySelector('.studio-pane-rail--right') as HTMLElement)
    await user.click(screen.getByRole('tab', { name: /master inspector/i }))

    expect(screen.getByRole('heading', { name: /patch browser/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /patch output/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /final mix/i })).toBeInTheDocument()
  })

  it('resizes the mix and timeline panels vertically', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()

    const { container } = render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    const workspace = container.querySelector('.studio-workspace') as HTMLElement | null
    const centerPane = container.querySelector('.studio-pane--center') as HTMLElement | null

    expect(workspace).not.toBeNull()
    expect(centerPane).not.toBeNull()

    if (!workspace || !centerPane) {
      throw new Error('Studio workspace is missing.')
    }

    Object.defineProperty(centerPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 760,
        height: 720,
        top: 0,
        right: 760,
        bottom: 720,
        left: 0,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }),
    })

    const initialHeight = Number.parseFloat(workspace.style.getPropertyValue('--studio-mix-height'))

    fireEvent.pointerDown(screen.getByRole('separator', { name: /resize mix and timeline panels/i }), {
      clientY: 240,
    })

    expect(document.body.dataset.resizing).toBe('center')

    fireEvent.pointerMove(window, { clientY: 300 })

    await waitFor(() => {
      expect(Number.parseFloat(workspace.style.getPropertyValue('--studio-mix-height'))).toBe(
        initialHeight + 60,
      )
    })

    fireEvent.pointerUp(window)

    expect(document.body.dataset.resizing).toBeUndefined()
  })

  it('clarifies whether the inspector is editing a layer or the patch output', async () => {
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

    const inspectorSections = screen.getByRole('tablist', { name: 'Inspector sections' })
    const layerSections = screen.getByRole('tablist', { name: 'Layer inspector sections' })

    expect(within(inspectorSections).getAllByRole('tab')).toHaveLength(2)
    expect(within(inspectorSections).getByRole('tab', { name: /layer inspector/i })).toBeInTheDocument()
    expect(within(inspectorSections).getByRole('tab', { name: /master inspector/i })).toBeInTheDocument()
    expect(within(inspectorSections).queryByRole('tab', { name: /filter/i })).not.toBeInTheDocument()
    expect(within(inspectorSections).queryByRole('tab', { name: /env/i })).not.toBeInTheDocument()
    expect(within(layerSections).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Filter',
      'Env',
      'Layer',
    ])

    expect(screen.getByRole('heading', { name: /layer inspector/i })).toBeInTheDocument()
    expect(screen.queryByText(/layer, envelope, and filter apply only to this layer\./i)).not.toBeInTheDocument()
    expect(screen.getByText(/layer scope/i).getAttribute('data-tooltip')).toMatch(
      /layer, envelope, and filter apply only to this layer\./i,
    )
    expect(screen.getByRole('button', { name: /^up$/i })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /master inspector/i }))

    expect(screen.getByRole('heading', { name: /patch output/i })).toBeInTheDocument()
    expect(
      screen.queryByText(/master controls shape the final mix after all layers are combined\./i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/patch scope/i)).toHaveAttribute(
      'data-tooltip',
      'Master controls shape the final mix after all layers are combined.',
    )
    expect(screen.queryByRole('button', { name: /^up$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: /layer inspector sections/i })).not.toBeInTheDocument()
  })

  it('previews the selected patch browser source when clicked', async () => {
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

    const sourceCards = within(screen.getByLabelText(/studio patch browser/i)).getAllByRole('button')

    expect(sourceCards.length).toBeGreaterThan(1)

    await user.click(sourceCards[1])

    await waitFor(() => {
      expect(transport.play).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('status')).toHaveTextContent(/previewing/i)
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
    await user.click(screen.getByRole('button', { name: /delete layer 3/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/removed layer 3/i)
    expect(screen.getByRole('group', { name: /layer timeline/i })).not.toHaveTextContent(/layer 3/i)
  })

  it('applies AI assistant edits and can undo the last AI change', async () => {
    const { transport } = createPreviewHarness()
    const save = vi.fn()
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reply: 'Added a shimmer layer and widened the mix.',
        operations: [
          {
            type: 'set_master',
            changes: {
              stereoWidth: 1.35,
              delayMix: 0.18,
            },
          },
          {
            type: 'add_layer',
            select: true,
            layer: {
              name: 'Shimmer',
              waveform: 'sine',
              gain: 0.22,
              pan: 0.26,
              noise: 0.04,
              startFreq: 1400,
              endFreq: 2200,
              durationMs: 260,
              envelope: {
                attackMs: 4,
                holdMs: 18,
                decayMs: 180,
                sustain: 0.12,
                releaseMs: 130,
              },
              filter: {
                type: 'highpass',
                cutoffHz: 1900,
                resonance: 1.1,
                envelopeAmount: 0.3,
              },
            },
          },
        ],
      }),
    } as Response)

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/studio" element={<StudioPage previewTransport={transport} save={save} />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /open ai assistant/i }))
    await user.type(screen.getByLabelText(/describe the sound you want/i), 'Add shimmer and widen the mix.')
    await user.click(screen.getByRole('button', { name: /apply with ai/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(transport.play).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('status')).toHaveTextContent(/added a shimmer layer and widened the mix/i)
    expect(screen.getByRole('group', { name: /layer timeline/i })).toHaveTextContent(/shimmer/i)

    await user.click(screen.getByRole('button', { name: /undo ai/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/restored patch before the last ai change/i)
    expect(screen.getByRole('group', { name: /layer timeline/i })).not.toHaveTextContent(/shimmer/i)
  })
})
