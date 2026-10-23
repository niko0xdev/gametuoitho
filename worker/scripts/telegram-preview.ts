import express from 'express';
import { createServer } from 'vite';
import { Hono } from 'hono';
import { testDatabase } from '../test/telegram-db.ts';
import { authRoute } from '../src/routes/auth.ts';
import { bilacRoute } from '../src/routes/bilac.ts';
import { telegramRoute } from '../src/routes/telegram.ts';
import { processUpdate, tableMessage } from '../src/lib/telegram-commands.ts';
import { deliver } from '../src/lib/telegram-client.ts';
import { runTelegramSchedule } from '../src/lib/telegram-schedule.ts';
import { sha256Hex } from '../src/lib/password.ts';

// This process binds loopback only and uses an in-memory fixture database.
const port = Number(process.env.TELEGRAM_PREVIEW_PORT || 3310);
const { env, sqlite } = testDatabase();
Object.assign(env, { APP_URL: `http://localhost:${port}`, TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'local-fixture', TELEGRAM_WEBHOOK_SECRET: 'local-fixture', TELEGRAM_BOT_USERNAME: 'bilac_local_test_bot' });
sqlite.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await sha256Hex('LocalTest123'), 'owner');
sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group thử nghiệm local','owner');");
const messages: Array<{ message_id: number; text: string; reply_markup?: object }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('https://api.telegram.org/botlocal-fixture/')) return originalFetch(input, init);
  const method = url.split('/').pop();
  const payload = JSON.parse(String(init?.body || '{}'));
  let result: object = { status: 'administrator' };
  if (method === 'sendMessage') {
    const message = { message_id: messages.length + 1, text: String(payload.text), reply_markup: payload.reply_markup };
    messages.push(message); result = message;
  } else if (method === 'editMessageText') {
    const message = messages.find(m => m.message_id === payload.message_id);
    if (message) { message.text = payload.text; message.reply_markup = payload.reply_markup; }
    result = message ?? {};
  }
  return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
};
const api = new Hono();
api.route('/api/auth', authRoute); api.route('/api/bilac', bilacRoute); api.route('/api/telegram', telegramRoute);
const app = express();
app.use(express.json());
app.use('/api', async (req, res) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string' && !['host', 'content-length'].includes(key)) headers.set(key, value);
  const request = new Request(`http://localhost:${port}${req.originalUrl}`, { method: req.method, headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: JSON.stringify(req.body) }) });
  const pending: Promise<unknown>[] = [];
  const response = await api.fetch(request, env, { props: {}, waitUntil: p => { pending.push(p); }, passThroughOnException() {} });
  res.status(response.status); response.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(Buffer.from(await response.arrayBuffer()));
  await Promise.allSettled(pending);
});
let updateId = 1000;
app.get('/__test/state', async (_req, res) => {
  res.json({ messages, players: sqlite.prepare('SELECT id,name FROM bilac_players').all(), matches: sqlite.prepare('SELECT * FROM bilac_matches').all(), standings: await tableMessage(env, 'cup'), jobs: sqlite.prepare('SELECT id,status,error FROM telegram_outbox ORDER BY due_at DESC LIMIT 10').all() });
});
app.post('/__test/command', async (req, res) => {
  try {
    const { text, callback, messageId, replyTo, outsider } = req.body;
    const message = { message_id: messageId ?? updateId, from: { id: outsider ? 999 : 123 }, chat: { id: -456, type: 'supergroup' }, text: String(text || ''), reply_to_message: replyTo ? { text: messages.find(m => m.message_id === replyTo)?.text } : undefined };
    await processUpdate(env, callback ? { update_id: updateId++, callback_query: { id: String(updateId), from: message.from, data: String(callback), message } } : { update_id: updateId++, message });
    await deliver(env);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Local simulation failed' }); }
});
app.post('/__test/schedule', async (req, res) => {
  await runTelegramSchedule(env, req.body.slot === '21:00' ? '0 14 * * *' : '20 6 * * *', Date.now());
  res.json({ success: true });
});
const vite = await createServer({ server: { middlewareMode: true, hmr: { port: port + 1 } }, appType: 'custom' });
app.get('/telegram-test', async (_req, res) => {
  res.type('html').send(await vite.transformIndexHtml('/telegram-test', '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bi Lắc · Telegram local test</title></head><body><div id="root"></div><script type="module" src="/scripts/telegram-preview-ui.tsx"></script></body></html>'));
});
app.use(vite.middlewares);
app.listen(port, '127.0.0.1', () => console.log(`Telegram local test: http://localhost:${port}/telegram-test`));
