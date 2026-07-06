export type CallStructuredInput = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  functionName: string;
  schema: Record<string, unknown>;
  temperature?: number;
};

export async function callStructured(input: CallStructuredInput): Promise<unknown> {
  const url = `${input.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`;
  const body = {
    model: input.model,
    temperature: input.temperature ?? 0.2,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: input.functionName,
          parameters: input.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: input.functionName } },
    response_format: { type: 'json_object' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message ?? `AI request failed (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        tool_calls?: Array<{ function: { arguments: string } }>;
        content?: string | null;
      };
    }>;
  };

  const msg = data.choices?.[0]?.message;
  const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
  if (toolArgs) {
    return JSON.parse(toolArgs);
  }
  if (msg?.content) {
    return JSON.parse(msg.content);
  }
  throw new Error('AI response had no tool_calls or content');
}
