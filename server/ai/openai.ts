import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  baseURL?: string;
  messages: ChatMessage[];
  tools?: any[];
  toolChoice?: any;
  responseFormat?: any;
}

// Internal mutable binding so tests can stub via `__chatCompletionOverride` global.
let chatCompletionImpl = async (req: ChatRequest): Promise<any> => {
  const ai = new OpenAI({ apiKey: req.apiKey, baseURL: req.baseURL });
  const params: any = {
    model: req.model,
    messages: req.messages,
  };
  if (req.tools) params.tools = req.tools;
  if (req.toolChoice) params.tool_choice = req.toolChoice;
  if (req.responseFormat) params.response_format = req.responseFormat;
  return await ai.chat.completions.create(params);
};

export async function chatCompletion(req: ChatRequest): Promise<any> {
  const override = (globalThis as any).__chatCompletionOverride;
  if (override) return override(req);
  return chatCompletionImpl(req);
}

export function extractFunctionArgs(completion: any, toolName: string): string | null {
  const msg = completion.choices?.[0]?.message;
  const functionToolCall = msg?.tool_calls?.find(
    (tc: any) => tc.type === 'function' && tc.function?.name === toolName
  );
  return functionToolCall?.function?.arguments || null;
}

export function extractContent(completion: any): string | null {
  const msg = completion.choices?.[0]?.message;
  return msg?.content || null;
}