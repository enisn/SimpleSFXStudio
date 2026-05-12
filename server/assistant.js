import OpenAI from 'openai'

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

const assistantSystemPrompt = [
  'You are Soundmaker AI Assistant.',
  'Goal: edit a layered sound-design patch for a browser studio by calling the provided tools.',
  'Use tool calls for every patch edit. Do not describe JSON operations in text.',
  'For nullable tool fields you do not want to set, pass null.',
  'Use current layer ids when updating or removing.',
  'Use replace_patch when the user asks for a fresh sound from scratch or a total rebuild.',
  'Keep values inside provided limits.',
  'Preserve unrelated values unless the user asks to change them.',
  'If the user wants a specific layer adjusted, target that layer id from context.',
  'After tools run, briefly say what changed and what it should sound like.',
].join(' ')

const supportedWaveforms = ['sine', 'triangle', 'square', 'sawtooth']
const supportedFilterTypes = ['none', 'lowpass', 'highpass', 'bandpass']
const layerStringFields = ['id', 'name']
const layerBooleanFields = ['enabled', 'solo']
const layerNumberFields = [
  'gain',
  'pan',
  'noise',
  'startFreq',
  'endFreq',
  'detuneCents',
  'startMs',
  'durationMs',
  'vibratoDepth',
  'vibratoRate',
  'transient',
]
const envelopeNumberFields = ['attackMs', 'holdMs', 'decayMs', 'sustain', 'releaseMs']
const filterNumberFields = ['cutoffHz', 'resonance', 'envelopeAmount']
const masterNumberFields = ['gain', 'drive', 'delayMix', 'delayMs', 'delayFeedback', 'stereoWidth']

const nullableStringSchema = { type: ['string', 'null'] }
const nullableNumberSchema = { type: ['number', 'null'] }
const nullableBooleanSchema = { type: ['boolean', 'null'] }

function strictObject(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

function nullableEnumSchema(values) {
  return {
    type: ['string', 'null'],
    enum: [...values, null],
  }
}

function nullableSchema(schema) {
  return {
    anyOf: [schema, { type: 'null' }],
  }
}

const envelopeDraftSchema = strictObject({
  attackMs: nullableNumberSchema,
  holdMs: nullableNumberSchema,
  decayMs: nullableNumberSchema,
  sustain: nullableNumberSchema,
  releaseMs: nullableNumberSchema,
})

const filterDraftSchema = strictObject({
  type: nullableEnumSchema(supportedFilterTypes),
  cutoffHz: nullableNumberSchema,
  resonance: nullableNumberSchema,
  envelopeAmount: nullableNumberSchema,
})

const layerDraftSchema = strictObject({
  id: nullableStringSchema,
  name: nullableStringSchema,
  enabled: nullableBooleanSchema,
  solo: nullableBooleanSchema,
  waveform: nullableEnumSchema(supportedWaveforms),
  gain: nullableNumberSchema,
  pan: nullableNumberSchema,
  noise: nullableNumberSchema,
  startFreq: nullableNumberSchema,
  endFreq: nullableNumberSchema,
  detuneCents: nullableNumberSchema,
  startMs: nullableNumberSchema,
  durationMs: nullableNumberSchema,
  vibratoDepth: nullableNumberSchema,
  vibratoRate: nullableNumberSchema,
  transient: nullableNumberSchema,
  envelope: nullableSchema(envelopeDraftSchema),
  filter: nullableSchema(filterDraftSchema),
})

const masterDraftSchema = strictObject({
  gain: nullableNumberSchema,
  drive: nullableNumberSchema,
  delayMix: nullableNumberSchema,
  delayMs: nullableNumberSchema,
  delayFeedback: nullableNumberSchema,
  stereoWidth: nullableNumberSchema,
})

const patchDraftSchema = strictObject({
  id: nullableStringSchema,
  name: nullableStringSchema,
  description: nullableStringSchema,
  durationMs: nullableNumberSchema,
  master: nullableSchema(masterDraftSchema),
  layers: nullableSchema({
    type: 'array',
    items: layerDraftSchema,
  }),
})

export const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'set_patch_meta',
      description: 'Rename the patch or update its description.',
      strict: true,
      parameters: strictObject({
        name: nullableStringSchema,
        description: nullableStringSchema,
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_patch_duration',
      description: 'Set the total patch duration in milliseconds.',
      strict: true,
      parameters: strictObject({
        durationMs: { type: 'number' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_master',
      description: 'Change master output settings for the whole patch.',
      strict: true,
      parameters: masterDraftSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_layer',
      description: 'Add a new sound layer to the patch.',
      strict: true,
      parameters: strictObject({
        layer: layerDraftSchema,
        insertIndex: nullableNumberSchema,
        select: nullableBooleanSchema,
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_layer',
      description: 'Update an existing layer by id, name, or the special id "selected".',
      strict: true,
      parameters: strictObject({
        layerId: { type: 'string' },
        changes: layerDraftSchema,
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_layer',
      description: 'Remove an existing layer by id, name, or the special id "selected".',
      strict: true,
      parameters: strictObject({
        layerId: { type: 'string' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_layer',
      description: 'Duplicate an existing layer and optionally offset or rename it.',
      strict: true,
      parameters: strictObject({
        layerId: { type: 'string' },
        newName: nullableStringSchema,
        offsetMs: nullableNumberSchema,
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_layer',
      description: 'Move an existing layer to a new zero-based layer index.',
      strict: true,
      parameters: strictObject({
        layerId: { type: 'string' },
        toIndex: { type: 'number' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_patch',
      description: 'Replace the patch from scratch for a total rebuild.',
      strict: true,
      parameters: strictObject({
        selectLayerId: nullableStringSchema,
        patch: patchDraftSchema,
      }),
    },
  },
]

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

export function getAssistantConfig() {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim()

  if (!baseUrl || !apiKey || !model) {
    return null
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    model,
  }
}

export function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new HttpError(502, `${label} must be an object.`)
  }
}

function assertAllowedProperties(value, allowedProperties, label) {
  for (const key of Object.keys(value)) {
    if (!allowedProperties.includes(key)) {
      throw new HttpError(502, `${label} contains unsupported field "${key}".`)
    }
  }
}

function hasValue(value) {
  return value !== null && value !== undefined
}

function readOptionalString(value, label) {
  if (!hasValue(value)) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new HttpError(502, `${label} must be a string or null.`)
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function readRequiredString(value, label) {
  const trimmed = readOptionalString(value, label)

  if (!trimmed) {
    throw new HttpError(502, `${label} is required.`)
  }

  return trimmed
}

function readOptionalNumber(value, label) {
  if (!hasValue(value)) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(502, `${label} must be a finite number or null.`)
  }

  return value
}

function readRequiredNumber(value, label) {
  const number = readOptionalNumber(value, label)

  if (number === undefined) {
    throw new HttpError(502, `${label} is required.`)
  }

  return number
}

function readOptionalBoolean(value, label) {
  if (!hasValue(value)) {
    return undefined
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(502, `${label} must be a boolean or null.`)
  }

  return value
}

function readOptionalEnum(value, values, label) {
  if (!hasValue(value)) {
    return undefined
  }

  if (typeof value !== 'string' || !values.includes(value)) {
    throw new HttpError(502, `${label} must be one of: ${values.join(', ')}.`)
  }

  return value
}

function hasOwnFields(value) {
  return Object.keys(value).length > 0
}

function readMasterDraft(value, label, requireChange = true) {
  assertPlainObject(value, label)
  assertAllowedProperties(value, masterNumberFields, label)

  const changes = {}

  for (const field of masterNumberFields) {
    const nextValue = readOptionalNumber(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      changes[field] = nextValue
    }
  }

  if (requireChange && !hasOwnFields(changes)) {
    throw new HttpError(502, `${label} must include at least one setting.`)
  }

  return changes
}

function readEnvelopeDraft(value, label) {
  assertPlainObject(value, label)
  assertAllowedProperties(value, envelopeNumberFields, label)

  const envelope = {}

  for (const field of envelopeNumberFields) {
    const nextValue = readOptionalNumber(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      envelope[field] = nextValue
    }
  }

  return envelope
}

function readFilterDraft(value, label) {
  assertPlainObject(value, label)
  assertAllowedProperties(value, ['type', ...filterNumberFields], label)

  const filter = {}
  const filterType = readOptionalEnum(value.type, supportedFilterTypes, `${label}.type`)

  if (filterType !== undefined) {
    filter.type = filterType
  }

  for (const field of filterNumberFields) {
    const nextValue = readOptionalNumber(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      filter[field] = nextValue
    }
  }

  return filter
}

function readLayerDraft(value, label, requireChange = false) {
  assertPlainObject(value, label)
  assertAllowedProperties(
    value,
    [...layerStringFields, ...layerBooleanFields, 'waveform', ...layerNumberFields, 'envelope', 'filter'],
    label,
  )

  const layer = {}

  for (const field of layerStringFields) {
    const nextValue = readOptionalString(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      layer[field] = nextValue
    }
  }

  for (const field of layerBooleanFields) {
    const nextValue = readOptionalBoolean(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      layer[field] = nextValue
    }
  }

  const waveform = readOptionalEnum(value.waveform, supportedWaveforms, `${label}.waveform`)

  if (waveform !== undefined) {
    layer.waveform = waveform
  }

  for (const field of layerNumberFields) {
    const nextValue = readOptionalNumber(value[field], `${label}.${field}`)

    if (nextValue !== undefined) {
      layer[field] = nextValue
    }
  }

  if (hasValue(value.envelope)) {
    const envelope = readEnvelopeDraft(value.envelope, `${label}.envelope`)

    if (hasOwnFields(envelope)) {
      layer.envelope = envelope
    }
  }

  if (hasValue(value.filter)) {
    const filter = readFilterDraft(value.filter, `${label}.filter`)

    if (hasOwnFields(filter)) {
      layer.filter = filter
    }
  }

  if (requireChange && !hasOwnFields(layer)) {
    throw new HttpError(502, `${label} must include at least one layer setting.`)
  }

  return layer
}

function readPatchDraft(value, label) {
  assertPlainObject(value, label)
  assertAllowedProperties(value, ['id', 'name', 'description', 'durationMs', 'master', 'layers'], label)

  const patch = {}
  const id = readOptionalString(value.id, `${label}.id`)
  const name = readOptionalString(value.name, `${label}.name`)
  const description = readOptionalString(value.description, `${label}.description`)
  const durationMs = readOptionalNumber(value.durationMs, `${label}.durationMs`)

  if (id !== undefined) {
    patch.id = id
  }

  if (name !== undefined) {
    patch.name = name
  }

  if (description !== undefined) {
    patch.description = description
  }

  if (durationMs !== undefined) {
    patch.durationMs = durationMs
  }

  if (hasValue(value.master)) {
    const master = readMasterDraft(value.master, `${label}.master`, false)

    if (hasOwnFields(master)) {
      patch.master = master
    }
  }

  if (hasValue(value.layers)) {
    if (!Array.isArray(value.layers)) {
      throw new HttpError(502, `${label}.layers must be an array.`)
    }

    patch.layers = value.layers.map((layer, index) => readLayerDraft(layer, `${label}.layers[${index}]`, true))
  }

  if (!hasOwnFields(patch)) {
    throw new HttpError(502, `${label} must include patch data.`)
  }

  return patch
}

function parseToolArguments(toolCall) {
  if (toolCall.type !== 'function' || !toolCall.function) {
    throw new HttpError(502, 'Assistant model returned an unsupported tool call.')
  }

  if (!toolCall.id) {
    throw new HttpError(502, 'Assistant model returned a tool call without an id.')
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments || '{}')
    assertPlainObject(parsed, `Tool ${toolCall.function.name} arguments`)
    return parsed
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    throw new HttpError(502, `Tool ${toolCall.function.name} arguments must be valid JSON.`)
  }
}

export function toolCallToOperation(toolCall) {
  const name = toolCall.function?.name
  const args = parseToolArguments(toolCall)

  switch (name) {
    case 'set_patch_meta': {
      assertAllowedProperties(args, ['name', 'description'], 'set_patch_meta arguments')
      const operation = {
        type: 'set_patch_meta',
      }
      const nextName = readOptionalString(args.name, 'set_patch_meta.name')
      const nextDescription = readOptionalString(args.description, 'set_patch_meta.description')

      if (nextName !== undefined) {
        operation.name = nextName
      }

      if (nextDescription !== undefined) {
        operation.description = nextDescription
      }

      if (!operation.name && !operation.description) {
        throw new HttpError(502, 'set_patch_meta must include name or description.')
      }

      return operation
    }

    case 'set_patch_duration':
      assertAllowedProperties(args, ['durationMs'], 'set_patch_duration arguments')
      return {
        type: 'set_patch_duration',
        durationMs: readRequiredNumber(args.durationMs, 'set_patch_duration.durationMs'),
      }

    case 'set_master':
      return {
        type: 'set_master',
        changes: readMasterDraft(args, 'set_master arguments'),
      }

    case 'add_layer':
      assertAllowedProperties(args, ['layer', 'insertIndex', 'select'], 'add_layer arguments')
      {
        const operation = {
          type: 'add_layer',
          layer: readLayerDraft(args.layer, 'add_layer.layer', true),
        }
        const insertIndex = readOptionalNumber(args.insertIndex, 'add_layer.insertIndex')
        const select = readOptionalBoolean(args.select, 'add_layer.select')

        if (insertIndex !== undefined) {
          operation.insertIndex = insertIndex
        }

        if (select !== undefined) {
          operation.select = select
        }

        return operation
      }

    case 'update_layer':
      assertAllowedProperties(args, ['layerId', 'changes'], 'update_layer arguments')
      return {
        type: 'update_layer',
        layerId: readRequiredString(args.layerId, 'update_layer.layerId'),
        changes: readLayerDraft(args.changes, 'update_layer.changes', true),
      }

    case 'remove_layer':
      assertAllowedProperties(args, ['layerId'], 'remove_layer arguments')
      return {
        type: 'remove_layer',
        layerId: readRequiredString(args.layerId, 'remove_layer.layerId'),
      }

    case 'duplicate_layer': {
      assertAllowedProperties(args, ['layerId', 'newName', 'offsetMs'], 'duplicate_layer arguments')
      const operation = {
        type: 'duplicate_layer',
        layerId: readRequiredString(args.layerId, 'duplicate_layer.layerId'),
      }
      const newName = readOptionalString(args.newName, 'duplicate_layer.newName')
      const offsetMs = readOptionalNumber(args.offsetMs, 'duplicate_layer.offsetMs')

      if (newName !== undefined) {
        operation.newName = newName
      }

      if (offsetMs !== undefined) {
        operation.offsetMs = offsetMs
      }

      return operation
    }

    case 'move_layer':
      assertAllowedProperties(args, ['layerId', 'toIndex'], 'move_layer arguments')
      return {
        type: 'move_layer',
        layerId: readRequiredString(args.layerId, 'move_layer.layerId'),
        toIndex: readRequiredNumber(args.toIndex, 'move_layer.toIndex'),
      }

    case 'replace_patch': {
      assertAllowedProperties(args, ['selectLayerId', 'patch'], 'replace_patch arguments')
      const operation = {
        type: 'replace_patch',
        patch: readPatchDraft(args.patch, 'replace_patch.patch'),
      }
      const selectLayerId = readOptionalString(args.selectLayerId, 'replace_patch.selectLayerId')

      if (selectLayerId !== undefined) {
        operation.selectLayerId = selectLayerId
      }

      return operation
    }

    default:
      throw new HttpError(502, `Assistant model called unknown tool "${name || 'unknown'}".`)
  }
}

function extractMessageText(content) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text
        }

        return ''
      })
      .join('\n')
  }

  return ''
}

function createToolResultMessage(toolCall, operation) {
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      ok: true,
      operation: operation.type,
    }),
  }
}

function createAssistantToolMessage(message, toolCalls) {
  return {
    role: 'assistant',
    content: message.content ?? null,
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type,
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments || '{}',
      },
    })),
  }
}

function createAssistantMessages({ prompt, history, studio }) {
  return [
    { role: 'system', content: assistantSystemPrompt },
    {
      role: 'user',
      content: JSON.stringify(
        {
          type: 'studio-context',
          studio,
        },
        null,
        2,
      ),
    },
    ...history,
    { role: 'user', content: prompt },
  ]
}

function getFirstMessage(completion) {
  const message = completion?.choices?.[0]?.message

  if (!message) {
    throw new HttpError(502, 'Assistant model did not return a message.')
  }

  return message
}

function wrapOpenAIError(error) {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof OpenAI.APIError) {
    const statusCode = error.status === 429 ? 429 : 502
    const requestId = error.request_id ? ` Request id: ${error.request_id}.` : ''
    return new HttpError(statusCode, `${error.message || 'Assistant model request failed.'}${requestId}`)
  }

  return error
}

export async function getAssistantResponse(payload, options = {}) {
  const config = options.config ?? getAssistantConfig()

  if (!config) {
    throw new HttpError(
      503,
      'AI assistant is not configured. Set OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL on the server.',
    )
  }

  const client = options.client ?? createOpenAIClient(config)
  const messages = createAssistantMessages(payload)

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0.35,
      messages,
      tools: assistantTools,
      tool_choice: 'auto',
    })
    const message = getFirstMessage(completion)
    const toolCalls = message.tool_calls ?? []

    if (toolCalls.length === 0) {
      return {
        reply: extractMessageText(message.content).trim() || 'No patch changes were needed.',
        operations: [],
      }
    }

    const operations = toolCalls.map(toolCallToOperation)
    const finalCompletion = await client.chat.completions.create({
      model: config.model,
      temperature: 0.35,
      messages: [
        ...messages,
        createAssistantToolMessage(message, toolCalls),
        ...toolCalls.map((toolCall, index) => createToolResultMessage(toolCall, operations[index])),
      ],
      tools: assistantTools,
      tool_choice: 'none',
    })
    const finalMessage = getFirstMessage(finalCompletion)
    const reply =
      extractMessageText(finalMessage.content).trim() ||
      `Applied ${operations.length} assistant tool change${operations.length === 1 ? '' : 's'}.`

    return {
      reply,
      operations,
    }
  } catch (error) {
    throw wrapOpenAIError(error)
  }
}

export function validateAssistantRequest(body) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string',
        )
        .slice(-10)
        .map(({ role, content }) => ({ role, content }))
    : []
  const studio = body?.studio

  if (!prompt) {
    throw new HttpError(400, 'Prompt is required.')
  }

  if (prompt.length > 4000) {
    throw new HttpError(400, 'Prompt is too long.')
  }

  if (!studio || typeof studio !== 'object' || !studio.patch || !Array.isArray(studio.patch.layers)) {
    throw new HttpError(400, 'Studio context is required.')
  }

  return { prompt, history, studio }
}
