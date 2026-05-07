import { PRESETS } from '../presets'
import type { Waveform } from '../types'
import { STUDIO_PATCHES } from './presets'
import { createLayerId, normalizePatchTimelineBounds } from './patchUtils'
import {
  STUDIO_LIMITS,
  cloneStudioPatch,
  createStudioLayer,
  createStudioPatch,
  type StudioFilter,
  type StudioFilterType,
  type StudioLayer,
  type StudioMasterSettings,
  type StudioPatch,
} from './types'

export type AssistantChatRole = 'user' | 'assistant'

export interface AssistantChatMessage {
  id: string
  role: AssistantChatRole
  content: string
}

export type AssistantLayerDraft = Partial<
  Pick<
    StudioLayer,
    | 'id'
    | 'name'
    | 'enabled'
    | 'solo'
    | 'waveform'
    | 'gain'
    | 'pan'
    | 'noise'
    | 'startFreq'
    | 'endFreq'
    | 'detuneCents'
    | 'startMs'
    | 'durationMs'
    | 'vibratoDepth'
    | 'vibratoRate'
    | 'transient'
  >
> & {
  envelope?: Partial<StudioLayer['envelope']>
  filter?: Partial<StudioLayer['filter']>
}

export type AssistantPatchDraft = {
  id?: string
  name?: string
  description?: string
  durationMs?: number
  master?: Partial<StudioMasterSettings>
  layers?: AssistantLayerDraft[]
}

export type AssistantOperation =
  | { type: 'set_patch_meta'; name?: string; description?: string }
  | { type: 'set_patch_duration'; durationMs: number }
  | { type: 'set_master'; changes: Partial<StudioMasterSettings> }
  | { type: 'add_layer'; layer: AssistantLayerDraft; insertIndex?: number; select?: boolean }
  | { type: 'update_layer'; layerId: string; changes: AssistantLayerDraft }
  | { type: 'remove_layer'; layerId: string }
  | { type: 'duplicate_layer'; layerId: string; newName?: string; offsetMs?: number }
  | { type: 'move_layer'; layerId: string; toIndex: number }
  | { type: 'replace_patch'; patch: AssistantPatchDraft; selectLayerId?: string | null }

export interface StudioAssistantResponse {
  reply: string
  operations: AssistantOperation[]
}

export interface StudioAssistantRequest {
  prompt: string
  history: Array<Pick<AssistantChatMessage, 'role' | 'content'>>
  studio: ReturnType<typeof buildStudioAssistantContext>
}

export interface AppliedAssistantOperationsResult {
  patch: StudioPatch
  selectedLayerId: string
  didChange: boolean
  appliedCount: number
}

const supportedWaveforms: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth']
const supportedFilterTypes: StudioFilterType[] = ['none', 'lowpass', 'highpass', 'bandpass']

function createAssistantLayer(layer: AssistantLayerDraft, fallbackName: string) {
  const id = layer.id?.trim() || createLayerId()
  const name = layer.name?.trim() || fallbackName

  return createStudioLayer(id, name, {
    ...layer,
    id,
    name,
    envelope: layer.envelope as StudioLayer['envelope'] | undefined,
    filter: layer.filter as StudioFilter | undefined,
  })
}

function resolveLayerIndex(patch: StudioPatch, layerId: string, selectedLayerId: string) {
  const normalizedLayerId = layerId.trim().toLowerCase()

  if (normalizedLayerId === 'selected') {
    return patch.layers.findIndex((layer) => layer.id === selectedLayerId)
  }

  const indexById = patch.layers.findIndex((layer) => layer.id === layerId)

  if (indexById >= 0) {
    return indexById
  }

  return patch.layers.findIndex((layer) => layer.name.trim().toLowerCase() === normalizedLayerId)
}

function mergeLayerChanges(layer: StudioLayer, changes: AssistantLayerDraft) {
  const nextName = changes.name?.trim() || layer.name
  const nextId = changes.id?.trim() || layer.id

  return createStudioLayer(nextId, nextName, {
    ...layer,
    ...changes,
    id: nextId,
    name: nextName,
    envelope: {
      ...layer.envelope,
      ...changes.envelope,
    } as StudioLayer['envelope'],
    filter: {
      ...layer.filter,
      ...changes.filter,
    } as StudioFilter,
  })
}

function clampInsertIndex(index: number | undefined, layerCount: number) {
  if (index === undefined || !Number.isFinite(index)) {
    return layerCount
  }

  return Math.max(0, Math.min(layerCount, Math.round(index)))
}

function ensureSelectedLayerId(patch: StudioPatch, selectedLayerId: string) {
  return patch.layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : (patch.layers[0]?.id ?? 'layer-1')
}

export function buildStudioAssistantContext(patch: StudioPatch, selectedLayerId: string | null) {
  const selectedLayer = patch.layers.find((layer) => layer.id === selectedLayerId) ?? patch.layers[0] ?? null

  return {
    patch,
    selectedLayerId,
    selectedLayerSummary: selectedLayer
      ? {
          id: selectedLayer.id,
          name: selectedLayer.name,
          waveform: selectedLayer.waveform,
          startMs: selectedLayer.startMs,
          durationMs: selectedLayer.durationMs,
          startFreq: selectedLayer.startFreq,
          endFreq: selectedLayer.endFreq,
        }
      : null,
    limits: STUDIO_LIMITS,
    supportedWaveforms,
    supportedFilterTypes,
    availableSources: {
      studio: STUDIO_PATCHES.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
      })),
      landing: PRESETS.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
      })),
    },
  }
}

export function applyAssistantOperations(
  patch: StudioPatch,
  selectedLayerId: string,
  operations: AssistantOperation[],
): AppliedAssistantOperationsResult {
  let nextPatch = cloneStudioPatch(patch)
  let nextSelectedLayerId = ensureSelectedLayerId(nextPatch, selectedLayerId)
  let appliedCount = 0

  for (const operation of operations) {
    switch (operation.type) {
      case 'set_patch_meta': {
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          name: operation.name?.trim() || nextPatch.name,
          description: operation.description?.trim() || nextPatch.description,
        })
        appliedCount += 1
        break
      }

      case 'set_patch_duration': {
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          durationMs: operation.durationMs,
        })
        appliedCount += 1
        break
      }

      case 'set_master': {
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          master: {
            ...nextPatch.master,
            ...operation.changes,
          },
        })
        appliedCount += 1
        break
      }

      case 'add_layer': {
        const nextLayer = createAssistantLayer(operation.layer, `Layer ${nextPatch.layers.length + 1}`)
        const insertIndex = clampInsertIndex(operation.insertIndex, nextPatch.layers.length)
        const nextLayers = [...nextPatch.layers]

        nextLayers.splice(insertIndex, 0, nextLayer)
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          layers: nextLayers,
        })

        if (operation.select) {
          nextSelectedLayerId = nextLayer.id
        }

        appliedCount += 1
        break
      }

      case 'update_layer': {
        const layerIndex = resolveLayerIndex(nextPatch, operation.layerId, nextSelectedLayerId)

        if (layerIndex < 0) {
          break
        }

        const nextLayers = [...nextPatch.layers]
        const currentLayer = nextLayers[layerIndex]
        const updatedLayer = mergeLayerChanges(currentLayer, operation.changes)

        nextLayers[layerIndex] = updatedLayer
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          layers: nextLayers,
        })
        nextSelectedLayerId = updatedLayer.id
        appliedCount += 1
        break
      }

      case 'remove_layer': {
        if (nextPatch.layers.length === 1) {
          break
        }

        const layerIndex = resolveLayerIndex(nextPatch, operation.layerId, nextSelectedLayerId)

        if (layerIndex < 0) {
          break
        }

        const nextLayers = nextPatch.layers.filter((_, index) => index !== layerIndex)

        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          layers: nextLayers,
        })
        nextSelectedLayerId = ensureSelectedLayerId(nextPatch, nextSelectedLayerId)
        appliedCount += 1
        break
      }

      case 'duplicate_layer': {
        const layerIndex = resolveLayerIndex(nextPatch, operation.layerId, nextSelectedLayerId)

        if (layerIndex < 0) {
          break
        }

        const sourceLayer = nextPatch.layers[layerIndex]
        const duplicateLayerId = createLayerId()
        const duplicateLayer = createStudioLayer(duplicateLayerId, operation.newName?.trim() || `${sourceLayer.name} Copy`, {
          ...sourceLayer,
          id: duplicateLayerId,
          name: operation.newName?.trim() || `${sourceLayer.name} Copy`,
          startMs: sourceLayer.startMs + (operation.offsetMs ?? 12),
        })
        const nextLayers = [...nextPatch.layers]

        nextLayers.splice(layerIndex + 1, 0, duplicateLayer)
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          layers: nextLayers,
        })
        nextSelectedLayerId = duplicateLayer.id
        appliedCount += 1
        break
      }

      case 'move_layer': {
        const layerIndex = resolveLayerIndex(nextPatch, operation.layerId, nextSelectedLayerId)

        if (layerIndex < 0) {
          break
        }

        const nextLayers = [...nextPatch.layers]
        const [movedLayer] = nextLayers.splice(layerIndex, 1)
        const targetIndex = Math.max(0, Math.min(nextLayers.length, Math.round(operation.toIndex)))

        nextLayers.splice(targetIndex, 0, movedLayer)
        nextPatch = normalizePatchTimelineBounds({
          ...nextPatch,
          layers: nextLayers,
        })
        appliedCount += 1
        break
      }

      case 'replace_patch': {
        nextPatch = normalizePatchTimelineBounds(
          createStudioPatch({
            id: operation.patch.id ?? nextPatch.id,
            name: operation.patch.name ?? nextPatch.name,
            description: operation.patch.description ?? nextPatch.description,
            durationMs: operation.patch.durationMs ?? nextPatch.durationMs,
            master: {
              ...nextPatch.master,
              ...operation.patch.master,
            },
            layers: operation.patch.layers as StudioLayer[] | undefined,
          }),
        )
        nextSelectedLayerId = ensureSelectedLayerId(
          nextPatch,
          operation.selectLayerId?.trim() || nextPatch.layers[0]?.id || 'layer-1',
        )
        appliedCount += 1
        break
      }
    }

    nextSelectedLayerId = ensureSelectedLayerId(nextPatch, nextSelectedLayerId)
  }

  return {
    patch: nextPatch,
    selectedLayerId: nextSelectedLayerId,
    didChange: appliedCount > 0,
    appliedCount,
  }
}
