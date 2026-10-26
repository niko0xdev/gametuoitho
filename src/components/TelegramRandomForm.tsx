import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Loader2, Search, Shuffle, Users } from 'lucide-react';

export interface TelegramMiniApp { initData: string; ready?: () => void; expand?: () => void; close?: () => void }
interface FormData { players: Array<{ id: string; name: string }>; groupName: string; tournamentName: string; expiresAt: number; submittedMatchId: string | null }
type MiniAppWindow = Window & { Telegram?: { WebApp?: TelegramMiniApp } };
let sdkLoading: Promise<TelegramMiniApp> | null = null;
function loadSdk() {
  const current = (window as MiniAppWindow).Telegram?.WebApp;
  if (current) return Promise.resolve(current);
  if (!sdkLoading) sdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js'; script.async = true;
    script.onload = () => {
      const app = (window as MiniAppWindow).Telegram?.WebApp;
      if (app) resolve(app); else reject(new Error('Chưa mở được Telegram Mini App.'));
    };
    script.onerror = () => { sdkLoading = null; reject(new Error('Không tải được Telegram. Hãy kiểm tra mạng và mở lại form.')); };
    document.head.appendChild(script);
  });
  return sdkLoading;
}
const searchKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi');

export default function TelegramRandomForm({ telegramApp }: { telegramApp?: TelegramMiniApp }) {
  const [data, setData] = useState<FormData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const app = useRef<TelegramMiniApp | null>(null);
  const submitting = useRef(false);
  const legacyDraftId = new URLSearchParams(window.location.search).get('draft') ?? '';
  const draftId = useRef(legacyDraftId);
  async function request(method: 'GET' | 'POST', playerIds?: string[], signal?: AbortSignal) {
    if (!app.current?.initData) throw new Error('Hãy mở form bằng nút trong chat riêng với bot Telegram.');
    const response = await fetch(`/api/telegram/form/${encodeURIComponent(draftId.current)}`, {
      method, credentials: 'omit', cache: 'no-store', signal,
      headers: { Authorization: `tma ${app.current.initData}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ playerIds }) } : {}),
    });
    const result = await response.json().catch(() => ({ error: 'Máy chủ đang bận. Hãy thử lại sau ít phút.' }));
    if (!response.ok) throw new Error(result.error || 'Chưa thể xử lý. Hãy thử lại.');
    return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        app.current = telegramApp ?? await loadSdk();
        app.current.ready?.(); app.current.expand?.();
        const start = new URLSearchParams(app.current.initData).get('start_param');
        draftId.current = start?.startsWith('pick_') ? start.slice(5) : legacyDraftId;
        if (!/^[a-z0-9-]{1,64}$/.test(draftId.current)) throw new Error('Dùng /random trong group rồi bấm Mở form để chọn người.');
        const result = await request('GET', undefined, controller.signal) as FormData;
        if (active) { setData(result); setDone(Boolean(result.submittedMatchId)); }
      } catch (e) { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được danh sách.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [legacyDraftId, telegramApp]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 15000); return () => window.clearInterval(timer); }, []);
  const visible = useMemo(() => data?.players.filter(p => searchKey(p.name).includes(searchKey(search))) ?? [], [data, search]);
  const expired = Boolean(data && clock >= data.expiresAt);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || selected.size < 2 || expired || done) return;
    submitting.current = true; setBusy(true); setError('');
    try { await request('POST', [...selected]); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa chia được đội. Hãy thử lại.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (loading) return <main className="min-h-[100dvh] flex items-center justify-center gap-2 bg-stone-50 text-stone-600"><Loader2 className="w-5 h-5 animate-spin" /><p>Đang tải danh sách…</p></main>;
  if (!data) return <main className="min-h-[100dvh] bg-stone-50 p-6 flex items-center justify-center"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-6"><h1 className="font-bold text-xl mb-3">Mở form từ Telegram</h1><p role="alert" className="text-stone-600 text-sm">{error}</p></div></main>;
  if (done) return <main className="min-h-[100dvh] flex items-center justify-center bg-stone-50 p-6"><div className="max-w-sm w-full rounded-2xl border border-green-200 bg-white p-6 text-center space-y-4"><CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" /><h1 className="font-bold text-xl text-stone-900">Đã chia đội!</h1><p className="text-stone-600 text-sm">Kết quả đang được gửi về <strong>{data.groupName}</strong>. Bạn có thể dùng nút thắng/huỷ trong group.</p><button type="button" onClick={() => app.current?.close?.()} className="w-full rounded-xl bg-stone-900 text-white py-3 font-semibold">Đóng form</button></div></main>;
  return <main className="min-h-[100dvh] bg-stone-50 text-stone-900">
    <form onSubmit={submit} className="max-w-lg mx-auto">
      <header className="px-5 pt-6 pb-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">{data.tournamentName}</p><h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Ai đang có mặt?</h1><p className="text-sm text-stone-500">Chọn người, rồi bấm Chia đội. Kết quả gửi về {data.groupName}.</p></header>
      <div className="px-5 space-y-4 pb-5">
        <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2"><Search className="w-4 h-4 text-stone-400" /><input type="search" aria-label="Tìm người chơi" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên người chơi…" className="min-w-0 w-full bg-transparent py-1 outline-none text-sm" disabled={busy} /></label>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">Đã chọn {selected.size}/{data.players.length}</span><div className="flex gap-4"><button type="button" disabled={busy || expired} onClick={() => setSelected(new Set(data.players.map(p => p.id)))} className="font-semibold text-orange-700 py-2">Chọn tất cả</button><button type="button" disabled={busy || expired} onClick={() => setSelected(new Set())} className="text-stone-500 py-2">Bỏ chọn</button></div></div>
        <fieldset disabled={busy || expired} className="space-y-2"><legend className="sr-only">Danh sách người chơi</legend>{visible.map(p => <label key={p.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${selected.has(p.id) ? 'border-orange-400 bg-orange-50' : 'border-stone-200 bg-white'}`}><input type="checkbox" checked={selected.has(p.id)} onChange={e => { const checked = e.currentTarget.checked; setSelected(previous => { const next = new Set(previous); if (checked) next.add(p.id); else next.delete(p.id); return next; }); }} className="w-5 h-5 accent-orange-600 shrink-0" /><span className="font-medium text-sm break-words min-w-0 flex-1">{p.name}</span>{selected.has(p.id) && <Check className="w-4 h-4 text-orange-600" />}</label>)}</fieldset>
        {!visible.length && <p className="py-6 text-center text-sm text-stone-500">Không tìm thấy tên này.</p>}
      </div>
      <footer className="sticky bottom-0 border-t border-stone-200 bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-2">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {expired && <p role="alert" className="text-sm text-red-700">Form đã hết hạn. Dùng /random để mở lại.</p>}
        <button type="submit" disabled={busy || expired || selected.size < 2} className="w-full min-h-12 flex items-center justify-center gap-2 rounded-xl bg-orange-600 text-white font-bold disabled:bg-stone-200 disabled:text-stone-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shuffle className="w-5 h-5" />}{busy ? 'Đang chia đội…' : `Chia đội · ${selected.size} người`}</button>
        <p className="text-center text-xs text-stone-400">{selected.size < 2 ? 'Chọn ít nhất 2 người để chia đội.' : selected.size % 2 ? 'Lẻ người: một người sẽ dự bị trận này.' : 'Danh sách chỉ được gửi khi bấm Chia đội.'}</p>
      </footer>
    </form>
  </main>;
}
