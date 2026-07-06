import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callStructured } from '../src/lib/ai';

describe('callStructured', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses tool_calls[0].function.arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            tool_calls: [{
              function: { arguments: '{"teams":[{"name":"A","players":[]}]}' }
            }]
          }
        }]
      }),
    }));

    const result = await callStructured({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      functionName: 'extract',
      schema: { type: 'object', properties: { teams: { type: 'array' } } },
    });

    expect(result).toEqual({ teams: [{ name: 'A', players: [] }] });
  });

  it('falls back to message.content JSON when tool_calls absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"teams":[]}' } }]
      }),
    }));

    const result = await callStructured({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      functionName: 'extract',
      schema: { type: 'object', properties: { teams: { type: 'array' } } },
    });

    expect(result).toEqual({ teams: [] });
  });

  it('throws on non-ok response with API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad key' } }),
    }));

    await expect(
      callStructured({
        apiKey: 'k',
        model: 'm',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        functionName: 'extract',
        schema: { type: 'object', properties: {} },
      })
    ).rejects.toThrow('bad key');
  });
});
