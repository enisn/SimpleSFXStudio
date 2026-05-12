import { describe, expect, it, vi } from 'vitest'
import { getAssistantResponse } from './assistant.js'

function createPayload() {
  return {
    prompt: 'Add shimmer and widen the mix.',
    history: [],
    studio: {
      patch: {
        id: 'studio-patch',
        name: 'Test Patch',
        layers: [{ id: 'layer-1', name: 'Body' }],
      },
      selectedLayerId: 'layer-1',
    },
  }
}

function createMockClient(create) {
  return {
    chat: {
      completions: {
        create,
      },
    },
  }
}

function createToolCall(id, name, args) {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    },
  }
}

describe('getAssistantResponse', () => {
  it('sends SDK chat completion tools and converts tool calls to ordered operations', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                createToolCall('call-master', 'set_master', {
                  stereoWidth: 1.35,
                  delayMix: 0.18,
                }),
                createToolCall('call-layer', 'add_layer', {
                  layer: {
                    name: 'Shimmer',
                    waveform: 'sine',
                    gain: 0.22,
                    envelope: {
                      attackMs: 4,
                    },
                  },
                  insertIndex: null,
                  select: true,
                }),
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Added a shimmer layer and widened the mix.',
            },
          },
        ],
      })

    const response = await getAssistantResponse(createPayload(), {
      client: createMockClient(create),
      config: { model: 'gpt-test' },
    })
    const firstRequest = create.mock.calls[0][0]
    const secondRequest = create.mock.calls[1][0]

    expect(firstRequest.model).toBe('gpt-test')
    expect(firstRequest.tool_choice).toBe('auto')
    expect(firstRequest.response_format).toBeUndefined()
    expect(firstRequest.tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['set_master', 'add_layer', 'replace_patch']),
    )
    expect(secondRequest.tool_choice).toBe('none')
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'tool', tool_call_id: 'call-master' }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call-layer' }),
      ]),
    )
    expect(response).toEqual({
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
          layer: {
            name: 'Shimmer',
            waveform: 'sine',
            gain: 0.22,
            envelope: {
              attackMs: 4,
            },
          },
          select: true,
        },
      ],
    })
  })

  it('returns plain assistant text without operations when no tools are called', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'The current patch already matches that request.',
          },
        },
      ],
    })

    const response = await getAssistantResponse(createPayload(), {
      client: createMockClient(create),
      config: { model: 'gpt-test' },
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      reply: 'The current patch already matches that request.',
      operations: [],
    })
  })

  it('fails unknown tool calls without requesting a final reply', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [createToolCall('call-unknown', 'delete_everything', {})],
          },
        },
      ],
    })

    await expect(
      getAssistantResponse(createPayload(), {
        client: createMockClient(create),
        config: { model: 'gpt-test' },
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'Assistant model called unknown tool "delete_everything".',
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('fails malformed tool arguments without requesting a final reply', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [createToolCall('call-bad-json', 'set_master', '{"gain":')],
          },
        },
      ],
    })

    await expect(
      getAssistantResponse(createPayload(), {
        client: createMockClient(create),
        config: { model: 'gpt-test' },
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'Tool set_master arguments must be valid JSON.',
    })
    expect(create).toHaveBeenCalledTimes(1)
  })
})
