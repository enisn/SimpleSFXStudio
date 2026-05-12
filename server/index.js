import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAssistantConfig, getAssistantResponse, HttpError, validateAssistantRequest } from './assistant.js'

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
