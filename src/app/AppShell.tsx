import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { SoundParams } from '../audio/types'
import type { PreviewTransport } from '../audio/runtime'
import type { StudioPatch } from '../audio/studio/types'
import type { StudioPreviewTransport } from '../audio/studio/runtime'
import LandingPage from '../pages/LandingPage'
import StudioPage from '../pages/StudioPage'

export type AppShellProps = {
  previewTransport?: PreviewTransport
  save?: (params: SoundParams, presetName: string) => void
  studioPreviewTransport?: StudioPreviewTransport
  studioSave?: (patch: StudioPatch) => void
}

function AppShell({
  previewTransport,
  save,
  studioPreviewTransport,
  studioSave,
}: AppShellProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage previewTransport={previewTransport} save={save} />} />
        <Route
          path="/studio"
          element={<StudioPage previewTransport={studioPreviewTransport} save={studioSave} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppShell
