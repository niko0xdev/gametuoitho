---
name: ai-routes
description: Recipe for adding a new OpenAI-compatible AI endpoint to gametuoitho.space. Use when the user asks to add "AI parse X" or "AI summarize Y".
---

# Add a new AI route

All AI routes live in `server.ts`, grouped near `/api/ai/parse-roster` (around line 27+). They reuse the same SDK pattern.

## Template

```ts
app.post('/api/ai/<your-route>', async (req, res) => {
  // 1. Validate body — return 400 + Vietnamese message on missing fields.
  const { foo } = req.body;
  if (!foo || typeof foo !== 'string' || foo.trim() === '') {
    return res.status(400).json({ error: 'Vui lòng nhập ...!' });
  }

  try {
    // 2. Env gate — return 500 if keys are missing.
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    if (!apiKey) return res.status(500).json({ error: 'Chưa cấu hình OPENAI_API_KEY!' });
    if (!model) return res.status(500).json({ error: 'Chưa cấu hình OPENAI_MODEL!' });

    const ai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });

    // 3. Structured Outputs tool definition. JSON schema with `additionalProperties: false`.
    const myTool = {
      type: 'function' as const,
      function: {
        name: 'extract_xxx',
        description: '...',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: { /* ... */ },
          required: ['...'],
        },
      },
    };

    // 4. Call with tool_choice + json_object fallback.
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Vietnamese instructions...' },
        { role: 'user', content: foo },
      ],
      tools: [myTool],
      tool_choice: { type: 'function', function: { name: 'extract_xxx' } },
      response_format: { type: 'json_object' },
    });

    // 5. Two-step parse — prefer tool_call arguments, fall back to JSON in content.
    const msg = completion.choices?.[0]?.message;
    const fnCall = msg?.tool_calls?.find(
      (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
        tc.type === 'function' && (tc as any).function?.name === 'extract_xxx',
    );

    let data: any;
    if (fnCall?.function?.arguments) {
      data = JSON.parse(fnCall.function.arguments);
    } else if (msg?.content) {
      try { data = JSON.parse(msg.content.trim()); }
      catch { return res.status(500).json({ error: 'AI trả về không phải JSON.' }); }
    } else {
      return res.status(500).json({ error: 'AI không trả kết quả.' });
    }

    // 6. Normalize / dedup / validate enums here.
    // 7. Return cleaned payload.
    res.json({ /* ... */ });
  } catch (error: any) {
    console.error('AI API Error:', error);
    res.status(500).json({ error: 'Không thể ... Chi tiết: ' + (error.message || error) });
  }
});
```

## Why each piece matters

- **`tool_choice`** — guarantees the provider uses the function and emits arguments matching your JSON schema.
- **`response_format: json_object`** — Ollama and some older providers ignore `tool_choice` and write JSON to `content`. The fallback path covers them.
- **`additionalProperties: false`** — prevents LLM from injecting extra fields that downstream consumers don't expect.
- **Type-narrow `find(...)`** — `OpenAI` SDK union-returns tool calls (function + custom) so the `as any` cast narrows to function tool before reading `function.arguments`. Don't refactor that away.

## Frontend pattern

```ts
const res = await fetch('/api/ai/<your-route>', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ foo }),
});
const data = await res.json();
if (!res.ok) { /* show data.error */ }
```

Display as preview chips with **two-step** UX:
1. `Preview`: call API, show parsed result.
2. `Apply / Confirm`: user clicks to push into the parent form's state.

Never auto-save AI-generated data without explicit user confirmation. This is a hard convention for the project.
