import OpenAI from 'openai';

export type JsonSchema = Record<string, unknown>;
export type AiCall = {
  systemPrompt: string;
  userPrompt: string;
  schema: JsonSchema;
  functionName: string;
};

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Thiếu OPENAI_API_KEY');
  _client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  });
  return _client;
}

export async function callStructured(call: AiCall): Promise<unknown> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const res = await client().chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: call.systemPrompt },
      { role: 'user', content: call.userPrompt },
    ],
    tools: [
      { type: 'function', function: { name: call.functionName, parameters: call.schema } },
    ],
    tool_choice: { type: 'function', function: { name: call.functionName } },
  });
  const msg = res.choices[0]?.message;
  const first = msg?.tool_calls?.[0];
  const toolArgs = first && first.type === 'function' ? first.function?.arguments : undefined;
  if (toolArgs) return JSON.parse(toolArgs);
  if (msg?.content) return JSON.parse(msg.content);
  throw new Error('AI trả về rỗng');
}
