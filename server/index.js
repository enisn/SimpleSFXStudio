import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '..', 'dist')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const maxBodyBytes = 1024 * 1024

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const assistantSystemPrompt = [
  'You are Soundmaker AI Assistant.',
  'Goal: edit a layered sound-design patch for a browser studio.',
  'Always answer with valid JSON only. No markdown. No explanation outside JSON.',
  'Return object shape: {"reply": string, "operations": AssistantOperation[]}.',
  'AssistantOperation is one of:',
  '- {"type":"set_patch_meta","name"?:string,"description"?:string}',
  '- {"type":"set_patch_duration","durationMs":number}',
  '- {"type":"set_master","changes":{"gain"?:number,"drive"?:number,"delayMix"?:number,"delayMs"?:number,"delayFeedback"?:number,"stereoWidth"?:number}}',
  '- {"type":"add_layer","insertIndex"?:number,"select"?:boolean,"layer":{"id"?:string,"name"?:string,"enabled"?:boolean,"solo"?:boolean,"waveform"?:"sine"|"triangle"|"square"|"sawtooth","gain"?:number,"pan"?:number,"noise"?:number,"startFreq"?:number,"endFreq"?:number,"detuneCents"?:number,"startMs"?:number,"durationMs"?:number,"vibratoDepth"?:number,"vibratoRate"?:number,"transient"?:number,"envelope"?:{"attackMs"?:number,"holdMs"?:number,"decayMs"?:number,"sustain"?:number,"releaseMs"?:number},"filter"?:{"type"?:"none"|"lowpass"|"highpass"|"bandpass","cutoffHz"?:number,"resonance"?:number,"envelopeAmount"?:number}}}',
  '- {"type":"update_layer","layerId":string,"changes":same_layer_object_as_add_layer}',
  '- {"type":"remove_layer","layerId":string}',
  '- {"type":"duplicate_layer","layerId":string,"newName"?:string,"offsetMs"?:number}',
  '- {"type":"move_layer","layerId":string,"toIndex":number}',
  '- {"type":"replace_patch","selectLayerId"?:string|null,"patch":{"id"?:string,"name"?:string,"description"?:string,"durationMs"?:number,"master"?:{"gain"?:number,"drive"?:number,"delayMix"?:number,"delayMs"?:number,"delayFeedback"?:number,"stereoWidth"?:number},"layers"?:[same_layer_object_as_add_layer]}}',
  'Rules:',
  '- Use current layer ids when updating or removing.',
  '- Use replace_patch when user asks for a fresh sound from scratch or a total rebuild.',
  '- Keep values inside provided limits.',
  '- Preserve unrelated values unless the user asks to change them.',
  '- If user wants a specific layer adjusted, target that layer id from context.',
  '- reply should briefly say what changed and what it should sound like.',
].join(' ')

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

async function readJsonBody(request) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length

    if (totalBytes > maxBodyBytes) {
      throw new HttpError(413, 'Request body is too large.')
    }

    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function getAssistantConfig() {
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

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }

        return ''
      })
      .join('\n')
  }

  return ''
}

function extractJsonString(text) {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  throw new Error('Model did not return JSON.')
}

async function fetchAssistantCompletion(config, messages, useJsonMode) {
  const endpoint = new URL('chat/completions', config.baseUrl)
  const body = {
    model: config.model,
    temperature: 0.35,
    messages,
    ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
  }

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })
}

async function getAssistantResponse({ prompt, history, studio }) {
  const config = getAssistantConfig()

  if (!config) {
    throw new HttpError(
      503,
      'AI assistant is not configured. Set OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL on the server.',
    )
  }

  const messages = [
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

  let completionResponse = await fetchAssistantCompletion(config, messages, true)

  if (!completionResponse.ok && completionResponse.status === 400) {
    completionResponse = await fetchAssistantCompletion(config, messages, false)
  }

  if (!completionResponse.ok) {
    const failureText = await completionResponse.text().catch(() => '')
    throw new HttpError(502, failureText || 'Assistant model request failed.')
  }

  const completion = await completionResponse.json()
  const content = extractTextContent(completion?.choices?.[0]?.message?.content)
  const jsonString = extractJsonString(content)

  try {
    const parsed = JSON.parse(jsonString)

    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'Applied your sound changes.',
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
    }
  } catch {
    throw new HttpError(502, 'Assistant model returned invalid JSON.')
  }
}

function validateAssistantRequest(body) {
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

async function serveStaticAsset(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const relativePath = normalizedPath.replace(/^\/+/, '')
  const absolutePath = path.resolve(distDir, relativePath)

  if (!absolutePath.startsWith(distDir)) {
    sendText(response, 403, 'Forbidden')
    return
  }

  try {
    const file = await readFile(absolutePath)
    const extension = path.extname(absolutePath)

    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    })
    response.end(file)
  } catch {
    try {
      const indexHtml = await readFile(path.join(distDir, 'index.html'))

      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(indexHtml)
    } catch {
      sendText(response, 404, 'Build output not found. Run npm run build first.')
    }
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

    if (request.method === 'GET' && requestUrl.pathname === '/api/assistant/health') {
      sendJson(response, 200, {
        ok: true,
        configured: Boolean(getAssistantConfig()),
      })
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/assistant/chat') {
      const body = await readJsonBody(request)
      const payload = validateAssistantRequest(body)
      const assistantResponse = await getAssistantResponse(payload)

      sendJson(response, 200, assistantResponse)
      return
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'Not found.' })
      return
    }

    await serveStaticAsset(requestUrl.pathname, response)
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, { error: error.message })
      return
    }

    sendJson(response, 500, { error: 'Unexpected server error.' })
  }
})

server.listen(port, host, () => {
  console.log(`Soundmaker server listening on http://${host}:${port}`)
})
