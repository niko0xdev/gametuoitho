import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// We test the route + helper at the edge of contract:
//   1) 400 when body lacks `summary`
//   2) 502 when OPENAI_API_KEY is unset → callStructured throws and the
//      route handler should map that to a 502 with a Vietnamese error.
//
// Per CLAUDE.md this route MUST NOT auto-save; the test body does not check
// for side effects because no side effects exist.

async function POST(body: Record<string, unknown>) {
  // Import lazily so the env-mutating `before` runs first.
  const { POST: handler } = await import('@/app/api/ai/parse-events/route');
  const req = new Request('http://t/api/ai/parse-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handler(req);
}

describe('POST /api/ai/parse-events', () => {
  it('400s when summary is missing', async () => {
    const res = await POST({});
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /tóm tắt/i);
  });

  it('502s when OPENAI_API_KEY is unset', async () => {
    // Remove the env var (if any) so the helper's internal client() throws.
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await POST({ summary: 'Văn Long ghi bàn phút 12.' });
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.match(String(body.error), /OPENAI_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});
