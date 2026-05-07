import type { StudioAssistantRequest, StudioAssistantResponse } from '../../audio/studio/assistant'

function getErrorMessage(status: number, fallback: string) {
  if (status === 429) {
    return 'AI assistant is busy right now. Try again in a moment.'
  }

  if (status === 503) {
    return 'AI assistant is not configured yet. Add server-side OpenAI env vars first.'
  }

  return fallback
}

export async function requestStudioAssistant(payload: StudioAssistantRequest) {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => null)) as
    | (StudioAssistantResponse & { error?: string })
    | { error?: string }
    | null

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, data?.error || 'AI assistant request failed.'))
  }

  if (!data || !('reply' in data) || !('operations' in data)) {
    throw new Error('AI assistant returned an invalid response.')
  }

  return data
}
