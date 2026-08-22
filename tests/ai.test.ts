import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';

beforeAll(() => {
  getApp();
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
});

// AI routes are gated behind requireLoggedIn (x-user-id). user_a is a seeded account.
const AUTH = { 'x-user-id': 'user_a' };

function stubChatCompletion(response: any) {
  (globalThis as any).__chatCompletionOverride = async () => response;
}
function clearStub() {
  delete (globalThis as any).__chatCompletionOverride;
}

describe('POST /api/ai/parse-roster', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'x' });
    assert.equal(res.status, 401);
  });
  it('400s without summary', async () => {
    const res = await request(getApp()).post('/api/ai/parse-roster', {}, AUTH);
    assert.equal(res.status, 400);
  });
  it('500s without OPENAI_API_KEY', async () => {
    const saved = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'text' }, AUTH);
    process.env.OPENAI_API_KEY = saved;
    assert.equal(res.status, 500);
  });
  it('500s without OPENAI_MODEL', async () => {
    const saved = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;
    const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'text' }, AUTH);
    process.env.OPENAI_MODEL = saved;
    assert.equal(res.status, 500);
  });
  it('returns parsed JSON from tool_call', async () => {
    stubChatCompletion({
      choices: [{
        message: {
          tool_calls: [{
            type: 'function',
            function: { name: 'parse_roster', arguments: JSON.stringify({ teams: [{ name: 'T1', players: ['Alice', 'Bob'] }] }) }
          }],
          content: null,
        }
      }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'some text' }, AUTH);
      assert.equal(res.status, 200);
      assert.equal(res.body.teams[0].name, 'T1');
    } finally { clearStub(); }
  });
  it('falls back to content when tool_call missing', async () => {
    stubChatCompletion({
      choices: [{ message: { content: JSON.stringify({ teams: [{ name: 'Fallback', players: [] }] }) } }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'more text' }, AUTH);
      assert.equal(res.status, 200);
      assert.equal(res.body.teams[0].name, 'Fallback');
    } finally { clearStub(); }
  });
  it('500s when content not parseable JSON', async () => {
    stubChatCompletion({
      choices: [{ message: { content: 'not json' } }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'x' }, AUTH);
      assert.equal(res.status, 500);
    } finally { clearStub(); }
  });
  it('500s when no tool_call and no content', async () => {
    stubChatCompletion({ choices: [{ message: {} }] });
    try {
      const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'x' }, AUTH);
      assert.equal(res.status, 500);
    } finally { clearStub(); }
  });
  it('500s when chat throws', async () => {
    (globalThis as any).__chatCompletionOverride = async () => { throw new Error('boom'); };
    try {
      const res = await request(getApp()).post('/api/ai/parse-roster', { summary: 'x' }, AUTH);
      assert.equal(res.status, 500);
      assert.ok(res.body.error.includes('boom'));
    } finally {
      delete (globalThis as any).__chatCompletionOverride;
    }
  });
});

describe('POST /api/ai/parse-players', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' });
    assert.equal(res.status, 401);
  });
  it('400s without text', async () => {
    const res = await request(getApp()).post('/api/ai/parse-players', {}, AUTH);
    assert.equal(res.status, 400);
  });
  it('parses and dedupes names from tool_call', async () => {
    stubChatCompletion({
      choices: [{
        message: {
          tool_calls: [{
            type: 'function',
            function: { name: 'extract_player_names', arguments: JSON.stringify({ names: ['Alice', 'alice', 'Bob', ''] }) }
          }],
          content: null,
        }
      }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-players', { text: 'list' }, AUTH);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.names, ['Alice', 'Bob']);
    } finally { clearStub(); }
  });
  it('parses names from content fallback', async () => {
    stubChatCompletion({
      choices: [{ message: { content: JSON.stringify({ names: ['X', 'Y'] }) } }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' }, AUTH);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.names, ['X', 'Y']);
    } finally { clearStub(); }
  });
  it('500s on invalid JSON content', async () => {
    stubChatCompletion({ choices: [{ message: { content: 'not json' } }] });
    try {
      const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' }, AUTH);
      assert.equal(res.status, 500);
    } finally { clearStub(); }
  });
  it('returns empty array when no content', async () => {
    stubChatCompletion({ choices: [{ message: { content: null } }] });
    try {
      const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' }, AUTH);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.names, []);
    } finally { clearStub(); }
  });
  it('500s when OPENAI_MODEL missing', async () => {
    const savedModel = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;
    const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' }, AUTH);
    process.env.OPENAI_MODEL = savedModel;
    assert.equal(res.status, 500);
  });
  it('500s when chat throws', async () => {
    (globalThis as any).__chatCompletionOverride = async () => { throw new Error('players-boom'); };
    try {
      const res = await request(getApp()).post('/api/ai/parse-players', { text: 'x' }, AUTH);
      assert.equal(res.status, 500);
      assert.ok(res.body.error.includes('players-boom'));
    } finally {
      delete (globalThis as any).__chatCompletionOverride;
    }
  });
});

describe('POST /api/ai/parse-events', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).post('/api/ai/parse-events', { summary: 'x' });
    assert.equal(res.status, 401);
  });
  it('400s without summary', async () => {
    const res = await request(getApp()).post('/api/ai/parse-events', {}, AUTH);
    assert.equal(res.status, 400);
  });
  it('parses events with valid types and sides from tool_call', async () => {
    stubChatCompletion({
      choices: [{
        message: {
          tool_calls: [{
            type: 'function',
            function: { name: 'extract_match_events', arguments: JSON.stringify({
              events: [
                { type: 'goal', teamSide: 'home', playerName: 'A', minute: 10, note: 'good goal' },
                { type: 'yellow', teamSide: 'away', playerName: 'B', minute: 20 },
                { type: 'red', teamSide: 'unknown', playerName: 'C' },
                { type: 'invalid', teamSide: 'home', playerName: 'D' },
                { type: 'goal', teamSide: 'home', playerName: 'E', minute: 999 },
              ]
            }) }
          }],
          content: null,
        }
      }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-events', { summary: 's' }, AUTH);
      assert.equal(res.status, 200);
      // 3 valid types (goal, yellow, red) + invalid filtered out = 4
      // 'unknown' side with playerName is KEPT (filter condition is `e.teamSide !== 'unknown' || e.playerName`)
      // minute=999 -> undefined (>200)
      assert.equal(res.body.events.length, 4);
      const goalHome = res.body.events.find((e: any) => e.playerName === 'A');
      assert.equal(goalHome.minute, 10);
      const invalidMin = res.body.events.find((e: any) => e.playerName === 'E');
      assert.equal(invalidMin.minute, undefined);
    } finally { clearStub(); }
  });
  it('returns empty when events array empty', async () => {
    stubChatCompletion({
      choices: [{
        message: { tool_calls: [{ type: 'function', function: { name: 'extract_match_events', arguments: '{"events":[]}' } }], content: null }
      }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-events', { summary: 's' }, AUTH);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.events, []);
    } finally { clearStub(); }
  });
  it('parses from content fallback', async () => {
    stubChatCompletion({
      choices: [{ message: { content: JSON.stringify({ events: [{ type: 'goal', teamSide: 'home', playerName: 'Z' }] }) } }]
    });
    try {
      const res = await request(getApp()).post('/api/ai/parse-events', { summary: 's' }, AUTH);
      assert.equal(res.status, 200);
      assert.equal(res.body.events.length, 1);
      assert.equal(res.body.events[0].playerName, 'Z');
    } finally { clearStub(); }
  });
  it('500s on invalid content JSON', async () => {
    stubChatCompletion({ choices: [{ message: { content: 'bad' } }] });
    try {
      const res = await request(getApp()).post('/api/ai/parse-events', { summary: 's' }, AUTH);
      assert.equal(res.status, 500);
    } finally { clearStub(); }
  });
  it('500s when chat throws', async () => {
    (globalThis as any).__chatCompletionOverride = async () => { throw new Error('events-boom'); };
    try {
      const res = await request(getApp()).post('/api/ai/parse-events', { summary: 's' }, AUTH);
      assert.equal(res.status, 500);
      assert.ok(res.body.error.includes('events-boom'));
    } finally {
      delete (globalThis as any).__chatCompletionOverride;
    }
  });
});
