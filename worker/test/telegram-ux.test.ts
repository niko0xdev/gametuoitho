import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase, seedLegacySelection } from './telegram-db';
import { createBiLacMatch } from '../src/lib/bilac-actions';
import { processUpdate } from '../src/lib/telegram-commands';

function fixture() {
  const { env, sqlite } = testDatabase();
  Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_USERNAME: 'fixture_bot' });
  sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'),('999','other'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner'); INSERT INTO bilac_tournament_members (id,tournament_id,user_id,username,display_name,role,joined_at) VALUES ('n','cup','other','other','Other','member',0)");
  const api: Array<{ method: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    api.push({ method: url.split('/').pop()!, body: JSON.parse(String(options.body)) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  }));
  let update = 100;
  const message = { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '' };
  const command = (text: string) => processUpdate(env, { update_id: update++, message: { ...message, text } });
  const click = (data: string, actor = 123, chatId = -456) => processUpdate(env, { update_id: update++, callback_query: { id: String(update), from: { id: actor }, data, message: { ...message, chat: { id: chatId, type: 'supergroup' } } } });
  const lastPayload = () => JSON.parse((sqlite.prepare('SELECT payload FROM telegram_outbox ORDER BY rowid DESC LIMIT 1').get() as { payload: string }).payload);
  const legacyRandom = async () => { seedLegacySelection(sqlite, '2s'); update = 101; };
  return { env, sqlite, command, click, lastPayload, api, legacyRandom };
}
afterEach(() => vi.unstubAllGlobals());
describe('Telegram selection form and quick match controls', () => {
  it('keeps existing inline checkbox messages usable without creating a match before submit', async () => {
    const f = fixture();
    await f.legacyRandom();
    await f.click('all:2s:0:0');
    const form = f.api[f.api.length - 1].body as { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } };
    expect(form.reply_markup.inline_keyboard[0]).toHaveLength(2);
    expect(form.reply_markup.inline_keyboard[0][0].text).toContain('☐');
    await f.click('all:2s:1:1');
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
    const draft = f.sqlite.prepare("SELECT payload,revision FROM telegram_drafts WHERE id='2s'").get() as { payload: string; revision: number };
    expect(JSON.parse(draft.payload).selected).toHaveLength(3);
    await f.click(`go:2s:${draft.revision}`);
    const buttons = f.lastPayload().reply_markup.inline_keyboard.flat();
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['🔵 A thắng', '🔴 B thắng', '✕ Huỷ trận']);
  });
  it.each(['wa', 'wb'])('allows a linked member to select %s, then requires that actor to confirm', async action => {
    const f = fixture();
    await f.legacyRandom(); await f.click('all:2s:0:1'); await f.click('go:2s:1');
    await f.click(`${action}:m2s:0`, 999);
    expect(f.sqlite.prepare('SELECT status FROM bilac_matches').get()).toEqual({ status: 'PLAYING' });
    const button = f.lastPayload().reply_markup.inline_keyboard[0][0];
    await f.click(button.callback_data, 123);
    expect(f.sqlite.prepare('SELECT status FROM bilac_matches').get()).toEqual({ status: 'PLAYING' });
    await f.click(button.callback_data, 999);
    const match = f.sqlite.prepare('SELECT status,score1,score2 FROM bilac_matches').get();
    expect(match).toEqual({ status: 'FINISHED', score1: action === 'wa' ? 7 : 6, score2: action === 'wa' ? 6 : 7 });
    await f.click(button.callback_data, 999);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_telegram_audit').get()).toEqual({ n: 1 });
  });
  it('lists the active match with /score and cancels it only after confirmation', async () => {
    const f = fixture();
    await f.legacyRandom(); await f.click('all:2s:0:1'); await f.click('go:2s:1');
    await f.command('/score');
    expect(f.lastPayload().text).toContain('Đội A');
    const cancel = f.lastPayload().reply_markup.inline_keyboard.flat().find((b: { text: string }) => b.text === '✕ Huỷ trận');
    await f.click(cancel.callback_data);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    const confirm = f.lastPayload().reply_markup.inline_keyboard[0][0];
    await f.click(confirm.callback_data);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
    await f.click(confirm.callback_data);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_telegram_audit').get()).toEqual({ n: 1 });
    await expect(createBiLacMatch(f.env, 'cup', 'owner', ['a','b'], 'tg-2s')).rejects.toThrow('đã được huỷ');
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it('rejects forwarded match controls and a stale cancellation after a web update', async () => {
    const f = fixture();
    await f.legacyRandom(); await f.click('all:2s:0:1'); await f.click('go:2s:1');
    await f.click('cx:m2s:0', 123, -789);
    expect(f.sqlite.prepare("SELECT count(*) n FROM telegram_drafts WHERE kind='cancel'").get()).toEqual({ n: 0 });
    await f.click('cx:m2s:0');
    const button = f.lastPayload().reply_markup.inline_keyboard[0][0];
    f.sqlite.exec('UPDATE bilac_matches SET score1=3');
    await f.click(button.callback_data);
    expect(f.sqlite.prepare('SELECT score1,status FROM bilac_matches').get()).toEqual({ score1: 3, status: 'PLAYING' });
  });
  it.each(['dismiss-first', 'confirm-first'])('serialises a simultaneous back/confirm action: %s', async ordering => {
    const f = fixture();
    await f.legacyRandom(); await f.click('all:2s:0:1'); await f.click('go:2s:1'); await f.click('wa:m2s:0');
    const [confirm, dismiss] = f.lastPayload().reply_markup.inline_keyboard[0];
    const draftId = confirm.callback_data.split(':')[1];
    const original = f.env.DB.prepare.bind(f.env.DB);
    let raced = false;
    vi.spyOn(f.env.DB, 'prepare').mockImplementation(sql => {
      const statement = original(sql);
      const target = ordering === 'dismiss-first' ? 'UPDATE telegram_drafts SET decision=?' : 'UPDATE telegram_drafts SET consumed=1';
      if (!raced && sql.startsWith(target)) {
        const run = statement.run.bind(statement);
        Object.assign(statement, { run: async () => {
          raced = true;
          f.sqlite.prepare(ordering === 'dismiss-first' ? 'UPDATE telegram_drafts SET consumed=1 WHERE id=?' : "UPDATE telegram_drafts SET decision='finish' WHERE id=?").run(draftId);
          return run();
        } });
      }
      return statement;
    });
    await f.click(ordering === 'dismiss-first' ? confirm.callback_data : dismiss.callback_data);
    expect(raced).toBe(true);
    expect(f.sqlite.prepare('SELECT status FROM bilac_matches').get()).toEqual({ status: 'PLAYING' });
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_telegram_audit').get()).toEqual({ n: 0 });
    if (ordering === 'confirm-first') {
      expect(f.api.filter(a => a.method === 'editMessageText' && String(a.body.text).includes('giữ nguyên'))).toHaveLength(0);
      await f.click(confirm.callback_data);
      expect(f.sqlite.prepare('SELECT status FROM bilac_matches').get()).toEqual({ status: 'FINISHED' });
    }
  });

});
