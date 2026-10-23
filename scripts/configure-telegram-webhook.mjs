// Run explicitly after configuring Worker secrets and deploying the endpoint.
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const endpoint = process.env.TELEGRAM_WEBHOOK_URL || 'https://gametuoitho.space/api/telegram/webhook';
if (!token || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('Set TELEGRAM_BOT_TOKEN and a valid TELEGRAM_WEBHOOK_SECRET in the process environment.');
  process.exit(1);
}
const url = new URL(endpoint);
if (url.protocol !== 'https:' || url.pathname !== '/api/telegram/webhook') {
  console.error('Use an HTTPS URL ending in /api/telegram/webhook.');
  process.exit(1);
}
async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram rejected ${method} (${data.error_code || response.status}).`);
  return data.result;
}
try {
  const bot = await call('getMe', {});
  await call('setWebhook', { url: endpoint, secret_token: secret, allowed_updates: ['message', 'callback_query', 'my_chat_member'], drop_pending_updates: false });
  await call('setMyCommands', { commands: [
    { command: 'help', description: 'Hướng dẫn sử dụng' },
    { command: 'random', description: 'Chọn người và chia đội' },
    { command: 'addplayer', description: 'Thêm người chơi vào giải' },
    { command: 'score', description: 'Nhập điểm và kết thúc trận' },
    { command: 'bxh', description: 'Xem bảng xếp hạng tuần' },
    { command: 'connect', description: 'Kết nối group bằng mã của chủ giải' },
  ] });
  const health = await call('getWebhookInfo', {});
  console.log(JSON.stringify({ botUsername: bot.username, webhookUrl: health.url, pendingUpdates: health.pending_update_count }, null, 2));
} catch (error) {
  // Do not print a fetch exception: it can contain the token-bearing URL.
  console.error(error instanceof Error && error.message.startsWith('Telegram rejected') ? error.message : 'Telegram setup failed. Check connectivity and credentials.');
  process.exitCode = 1;
}
