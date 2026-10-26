import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BiLacTelegramSettings from '../src/components/BiLacTelegramSettings';
import '../src/index.css';

interface Message { message_id: number; text: string; entities?: Array<{ type: string }>; reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } }
interface State { messages: Message[]; players: Array<{ id: string; name: string }>; standings: string; matches: Array<{ id: string; status: string; score1: number; score2: number }>; jobs: Array<{ id: string; status: string }> }
function Preview() {
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState('/help');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [outsider, setOutsider] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [state?.messages]);
  async function refresh() { const r = await fetch('/__test/state'); setState(await r.json()); }
  useEffect(() => { void fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'LocalTest123' }) }).then(r => { if (!r.ok) throw new Error('Không đăng nhập được tài khoản test.'); setReady(true); return refresh(); }).catch(e => setError(e.message)); }, []);
  async function action(path: string, body: object) {
    setError('');
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Thao tác test chưa thành công.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi test.'); }
  }
  const request = (url: string, options: RequestInit = {}) => fetch(url, { ...options, headers: { ...options.headers, 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'x-tournament-code': 'private' } });
  const btn = 'min-h-10 px-3 py-2 rounded-lg border border-stone-300 bg-white hover:bg-orange-50 text-sm font-semibold focus-visible:outline focus-visible:outline-orange-500';
  return <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-5 text-stone-900">
    <h1 className="text-2xl font-bold">Bi Lắc · Test Telegram</h1>
    <p className="text-sm text-stone-600">Group và bot giả lập chạy local, dữ liệu chỉ nằm trong bộ nhớ. Khởi động lại sẽ làm mới dữ liệu. Không gửi tin lên Telegram thật.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {ready && <BiLacTelegramSettings tournamentId="cup" userId="owner" request={request} />}
    <div className="grid md:grid-cols-2 gap-5">
      <section className="rounded-xl border border-stone-200 p-4 space-y-3">
        <h2 className="text-lg font-bold">Group giả lập</h2>
        <p className="text-sm">Thử: /addplayer Tên mới → xác nhận → /random → chọn người → chia đội → reply tin trận bằng /score 10 7 → kết thúc → /bxh.</p>
        <div className="flex flex-wrap gap-2">{['/help', '/random', '/addplayer Dũng', '/bxh'].map(c => <button className={btn} key={c} onClick={() => setText(c)}>{c}</button>)}</div>
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void action('/__test/command', { text, replyTo, outsider }); }}>
          <label className="block text-sm" htmlFor="command">Lệnh bot</label>
          <input id="command" className="w-full border border-stone-300 rounded-lg p-2" value={text} onChange={e => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3"><button className={btn}>Gửi lệnh</button><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={outsider} onChange={e => setOutsider(e.target.checked)} /> Thử người chưa liên kết</label></div>
          {replyTo && <p className="text-xs">Đang reply tin #{replyTo}. <button type="button" className="underline" onClick={() => setReplyTo(null)}>Bỏ reply</button></p>}
        </form>
        <div ref={chatRef} className="space-y-3 max-h-[650px] overflow-auto" aria-live="polite">{state?.messages.map(m => <article key={m.message_id} className="bg-stone-50 rounded-lg border border-stone-200 p-3 space-y-2">
          <pre className={`text-sm whitespace-pre-wrap break-words ${m.entities?.some(e => e.type === 'pre') ? 'font-mono' : 'font-sans'}`}>{m.text}</pre>
          {m.reply_markup?.inline_keyboard.map((row, i) => <div className="flex flex-wrap gap-2" key={i}>{row.map(b => b.callback_data ? <button key={b.callback_data} className={btn} onClick={() => void action('/__test/command', { callback: b.callback_data, messageId: m.message_id, outsider })}>{b.text}</button> : <a key={b.url} className={btn} href={b.url?.includes('start=pick_') ? `/telegram/random?draft=${new URL(b.url).searchParams.get('start')!.slice(5)}` : b.url} target="_blank" rel="noreferrer">{b.text}</a>)}</div>)}
          <button className="underline text-xs" onClick={() => { setReplyTo(m.message_id); setText('/score 10 7'); }}>Reply tin này</button>
        </article>)}</div>
      </section>
      <section className="rounded-xl border border-stone-200 p-4 space-y-4">
        <h2 className="text-lg font-bold">Dữ liệu giải đang lưu</h2>
        <p className="text-sm">Người chơi: {state?.players.map(p => p.name).join(', ')}</p>
        <pre className="whitespace-pre-wrap text-sm font-mono overflow-x-auto">{state?.standings}</pre>
        <div className="text-sm space-y-1">{state?.matches.map(m => <p key={m.id}>{m.id}: {m.score1} – {m.score2} · {m.status}</p>)}</div>
        <h3 className="font-bold">Kích hoạt lịch để test</h3>
        <div className="flex flex-wrap gap-2">{['13:20', '21:00'].map(slot => <button className={btn} key={slot} onClick={() => void action('/__test/schedule', { slot })}>Chạy lịch {slot}</button>)}<button className={btn} onClick={() => void refresh()}>Làm mới dữ liệu</button></div>
        <p className="text-xs text-stone-500">Bấm cùng khung giờ nhiều lần trong ngày chỉ tạo một bài BXH.</p>
        <div className="text-xs text-stone-500 space-y-1">{state?.jobs.map(j => <p key={j.id}>{j.status}: {j.id}</p>)}</div>
      </section>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
