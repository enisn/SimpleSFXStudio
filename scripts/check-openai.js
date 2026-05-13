import { assistantTools, createOpenAIClient, getAssistantConfig } from '../server/assistant.js'
import { loadLocalEnv } from '../server/env.js'

const loadedFiles = loadLocalEnv()
const config = getAssistantConfig()

function printEnvSource() {
  if (loadedFiles.length > 0) {
    console.log(`Loaded env files: ${loadedFiles.join(', ')}`)
    return
  }

  console.log('No local env files found. Using process environment only.')
}

function getMissingVariableNames() {
  return ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'].filter((name) => !process.env[name]?.trim())
}

printEnvSource()

if (!config) {
  const missingVariableNames = getMissingVariableNames()
  console.error(`OpenAI is not configured. Missing: ${missingVariableNames.join(', ')}`)
  console.error('Create .env from .env.example, fill in the values, then run npm run test:openai again.')
  process.exit(1)
}

console.log(`Testing OpenAI Chat Completions at ${config.baseUrl} with model ${config.model}...`)

try {
  const client = createOpenAIClient(config)
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: 'Reply with only: ok' }],
    tools: assistantTools,
    tool_choice: 'none',
  })
  const content = completion.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('OpenAI returned an empty response.')
  }

  console.log(`OpenAI check passed. Response: ${content}`)
} catch (error) {
  const status = error?.status ? `Status ${error.status}. ` : ''
  const requestId = error?.request_id ? ` Request id: ${error.request_id}.` : ''
  const message = error instanceof Error ? error.message : 'Unknown OpenAI request error.'

  console.error(`OpenAI check failed. ${status}${message}${requestId}`)
  process.exit(1)
}
