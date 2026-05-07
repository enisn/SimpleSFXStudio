import { clampStudioPatch, STUDIO_LIMITS, type StudioLayer, type StudioPatch } from './types'

export function createLayerId(random: () => number = Math.random) {
  return `layer-${random().toString(36).slice(2, 8)}`
}

export function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step
}

export function constrainLayerToPatchDuration(layer: StudioLayer, patchDurationMs: number) {
  const maxDurationMs = Math.max(
    STUDIO_LIMITS.layerDurationMs.min,
    Math.min(STUDIO_LIMITS.layerDurationMs.max, patchDurationMs),
  )
  const durationMs = Math.min(layer.durationMs, maxDurationMs)
  const maxStartMs = Math.max(0, patchDurationMs - durationMs)

  return {
    ...layer,
    startMs: Math.min(Math.max(layer.startMs, 0), maxStartMs),
    durationMs,
  }
}

export function normalizePatchTimelineBounds(patch: StudioPatch) {
  const clampedPatch = clampStudioPatch(patch)

  return {
    ...clampedPatch,
    layers: clampedPatch.layers.map((layer) => constrainLayerToPatchDuration(layer, clampedPatch.durationMs)),
  }
}
