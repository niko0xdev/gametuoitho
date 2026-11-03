import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Loader2, Search, Shuffle, Users } from 'lucide-react';

export interface TelegramMiniApp { initData: string; ready?: () => void; expand?: () => void; close?: () => void }
interface FormData { players: Array<{ id: string; name: string }>; groupName: string; tournamentName: string; expiresAt: number; submittedMatchId: string | null; selectionCacheKey?: string; manualTeamsEnabled?: boolean; timeoutModeEnabled?: boolean; resultMultipliers?: number[]; resultMultiplier?: number }
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
  const [resultMultiplier, setResultMultiplier] = useState<1 | 10>(1);
  const [mode, setMode] = useState<'random' | 'manual' | 'timeout'>('random');
  const [teams, setTeams] = useState<{ teamA: string[]; teamB: string[] }>({ teamA: [], teamB: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const app = useRef<TelegramMiniApp | null>(null);
  const submitting = useRef(false);
  const legacyDraftId = new URLSearchParams(window.location.search).get('draft') ?? '';
  const draftId = useRef(legacyDraftId);
  async function request(method: 'GET' | 'POST', body?: { playerIds: string[]; mode: 'random' | 'manual' | 'timeout'; resultMultiplier: 1 | 10; teamA?: string[]; teamB?: string[] }, signal?: AbortSignal) {
    if (!app.current?.initData) throw new Error('Hãy mở form bằng nút Mở form trong Telegram.');
    const response = await fetch(`/api/telegram/form/${encodeURIComponent(draftId.current)}`, {
      method, credentials: 'omit', cache: 'no-store', signal,
      headers: { Authorization: `tma ${app.current.initData}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
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
        if (active) {
          setData(result); setResultMultiplier(result.resultMultiplier === 10 ? 10 : 1); setDone(Boolean(result.submittedMatchId));
          try {
            if (result.selectionCacheKey) {
              const key = 'bilac:telegram:presence:v1:' + result.selectionCacheKey;
              const cached = JSON.parse(localStorage.getItem(key) ?? 'null');
              if (cached && Number.isFinite(cached.expiresAt) && cached.expiresAt > Date.now() && cached.expiresAt <= Date.now() + 2 * 3600000 && Array.isArray(cached.playerIds)) {
                const roster = new Set(result.players.map(p => p.id));
                setSelected(new Set(cached.playerIds.filter((id: unknown): id is string => typeof id === 'string' && roster.has(id))));
              } else if (cached) localStorage.removeItem(key);
            }
          } catch { /* Storage may be unavailable in the Telegram webview. */ }
        }
      } catch (e) { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được danh sách.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [legacyDraftId, telegramApp]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 15000); return () => window.clearInterval(timer); }, []);
  const visible = useMemo(() => data?.players.filter(p => searchKey(p.name).includes(searchKey(search))) ?? [], [data, search]);
  const expired = Boolean(data && clock >= data.expiresAt);
  const ready = mode === 'manual' ? teams.teamA.length === 2 && teams.teamB.length === 2 : selected.size >= (mode === 'timeout' ? 4 : 2);
  function assign(id: string, team: string) {
    setTeams(previous => {
      if ((team === 'teamA' || team === 'teamB') && previous[team].length >= 2) return previous;
      return { teamA: [...previous.teamA.filter(p => p !== id), ...(team === 'teamA' ? [id] : [])], teamB: [...previous.teamB.filter(p => p !== id), ...(team === 'teamB' ? [id] : [])] };
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !ready || expired || done) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const playerIds = mode === 'manual' ? [...teams.teamA, ...teams.teamB] : [...selected];
      await request('POST', { playerIds, mode, resultMultiplier, ...(mode === 'manual' ? teams : {}) });
      if (data?.selectionCacheKey) {
        try { localStorage.setItem('bilac:telegram:presence:v1:' + data.selectionCacheKey, JSON.stringify({ playerIds, expiresAt: Date.now() + 2 * 3600000 })); }
        catch { /* Creating a match does not depend on local storage. */ }
      }
      setDone(true);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa chia được đội. Hãy thử lại.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (loading) return <main className="min-h-[100dvh] flex items-center justify-center gap-2 bg-stone-50 text-stone-600"><Loader2 className="w-5 h-5 animate-spin" /><p>Đang tải danh sách…</p></main>;
  if (!data) return <main className="min-h-[100dvh] bg-stone-50 p-6 flex items-center justify-center"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-6"><h1 className="font-bold text-xl mb-3">Mở form từ Telegram</h1><p role="alert" className="text-stone-600 text-sm">{error}</p></div></main>;
  if (done) return <main className="min-h-[100dvh] flex items-center justify-center bg-stone-50 p-6"><div className="max-w-sm w-full rounded-2xl border border-green-200 bg-white p-6 text-center space-y-4"><CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" /><h1 className="font-bold text-xl text-stone-900">Đã chia đội!</h1><p className="text-stone-600 text-sm">Kết quả đang được gửi về <strong>{data.groupName}</strong>. Bạn có thể dùng nút thắng/huỷ trong group.</p>{resultMultiplier === 10 && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-800">Chế độ ×10: khi chốt kết quả sẽ tính tổng cộng 10 trận.</p>}<button type="button" onClick={() => app.current?.close?.()} className="w-full rounded-xl bg-stone-900 text-white py-3 font-semibold">Đóng form</button></div></main>;
  return <main className="min-h-[100dvh] bg-stone-50 text-stone-900">
    <form onSubmit={submit} className="max-w-lg mx-auto">
      <header className="px-5 pt-6 pb-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">{data.tournamentName}</p><h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Ai đang có mặt?</h1><p className="text-sm text-stone-500">Chọn ngẫu nhiên hoặc tự xếp hai đội. Kết quả gửi về {data.groupName}.</p></header>
      <div className="px-5 space-y-4 pb-5">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Chế độ tạo trận">{(['random', 'manual', 'timeout'] as const).map(value => (value === 'manual' && !data.manualTeamsEnabled) || (value === 'timeout' && !data.timeoutModeEnabled) ? null : <button key={value} type="button" aria-pressed={mode === value} disabled={busy || expired} onClick={() => setMode(value)} className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold ${mode === value ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-stone-200 bg-white text-stone-600'}`}>{value === 'random' ? '🎲 Ngẫu nhiên' : value === 'timeout' ? 'Hết giờ · 2v2' : '👥 Chọn tay 2 đôi'}</button>)}</div>
        {data.resultMultipliers?.includes(10) && <fieldset disabled={busy || expired} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <legend className="px-1 text-sm font-semibold">Cách tính kết quả</legend>
          <div className="grid grid-cols-2 gap-2">{([1, 10] as const).map(value => <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-3 cursor-pointer ${resultMultiplier === value ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-stone-200 text-stone-600'}`}><input type="radio" name="resultMultiplier" value={value} checked={resultMultiplier === value} onChange={() => setResultMultiplier(value)} className="h-4 w-4 accent-orange-600" /><span className="font-semibold text-sm">{value === 1 ? 'Thường · 1 trận' : '×10 · 10 trận'}</span></label>)}</div>
          <p className="text-xs leading-relaxed text-stone-500">{resultMultiplier === 10 ? 'Chơi 1 trận. Khi chốt kết quả, lưu tổng cộng 10 trận cùng đội và tỉ số. BXH tính đủ 10 trận.' : 'Chơi 1 trận và tính 1 kết quả như bình thường.'}</p>
        </fieldset>}
        {mode === 'manual' && <div className="grid grid-cols-2 gap-2">{(['teamA', 'teamB'] as const).map((team, index) => <section key={team} aria-label={`Đội ${index ? 'B' : 'A'}`} className={`rounded-xl border p-3 text-sm ${index ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}><h2 className="font-bold">Đội {index ? 'B' : 'A'} · {teams[team].length}/2</h2><p className="mt-1 break-words">{teams[team].map(id => data.players.find(p => p.id === id)?.name).join(' + ') || 'Chưa chọn người'}</p></section>)}</div>}

        <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2"><Search className="w-4 h-4 text-stone-400" /><input type="search" aria-label="Tìm người chơi" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên người chơi…" className="min-w-0 w-full bg-transparent py-1 outline-none text-sm" disabled={busy} /></label>
        {mode !== 'manual' && <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">Đã chọn {selected.size}/{data.players.length}</span><div className="flex gap-4"><button type="button" disabled={busy || expired} onClick={() => setSelected(new Set(data.players.map(p => p.id)))} className="font-semibold text-orange-700 py-2">Chọn tất cả</button><button type="button" disabled={busy || expired} onClick={() => setSelected(new Set())} className="text-stone-500 py-2">Bỏ chọn</button></div></div>}
        {mode === 'manual' ? <fieldset disabled={busy || expired} className="space-y-2"><legend className="sr-only">Xếp người vào đội</legend>{visible.map(p => <label key={p.id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"><span className="font-medium text-sm break-words min-w-0 flex-1">{p.name}</span><select aria-label={`Đội của ${p.name}`} value={teams.teamA.includes(p.id) ? 'teamA' : teams.teamB.includes(p.id) ? 'teamB' : ''} onChange={e => assign(p.id, e.target.value)} className="rounded-lg border border-stone-300 bg-white p-2 text-sm"><option value="">Không đá</option><option value="teamA" disabled={teams.teamA.length >= 2 && !teams.teamA.includes(p.id)}>Đội A</option><option value="teamB" disabled={teams.teamB.length >= 2 && !teams.teamB.includes(p.id)}>Đội B</option></select></label>)}</fieldset> : <fieldset disabled={busy || expired} className="space-y-2"><legend className="sr-only">Danh sách người chơi</legend>{visible.map(p => <label key={p.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${selected.has(p.id) ? 'border-orange-400 bg-orange-50' : 'border-stone-200 bg-white'}`}><input type="checkbox" checked={selected.has(p.id)} onChange={e => { const checked = e.currentTarget.checked; setSelected(previous => { const next = new Set(previous); if (checked) next.add(p.id); else next.delete(p.id); return next; }); }} className="w-5 h-5 accent-orange-600 shrink-0" /><span className="font-medium text-sm break-words min-w-0 flex-1">{p.name}</span>{selected.has(p.id) && <Check className="w-4 h-4 text-orange-600" />}</label>)}</fieldset>}
        {!visible.length && <p className="py-6 text-center text-sm text-stone-500">Không tìm thấy tên này.</p>}
      </div>
      <footer className="sticky bottom-0 border-t border-stone-200 bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-2">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {expired && <p role="alert" className="text-sm text-red-700">Form đã hết hạn. Dùng /random để mở lại.</p>}
        <button type="submit" disabled={busy || expired || !ready} className="w-full min-h-12 flex items-center justify-center gap-2 rounded-xl bg-orange-600 text-white font-bold disabled:bg-stone-200 disabled:text-stone-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shuffle className="w-5 h-5" />}{busy ? 'Đang tạo trận…' : `${mode === 'manual' ? 'Tạo trận · A gặp B' : mode === 'timeout' ? 'Hết giờ · Random 4 người' : `Chia đội · ${selected.size} người`}${resultMultiplier === 10 ? ' · ×10' : ''}`}</button>
        <p className="text-center text-xs text-stone-400">{mode === 'manual' ? 'Chọn đúng 2 người mỗi đội. Chỉ gửi khi bấm Tạo trận.' : mode === 'timeout' ? selected.size < 4 ? 'Chọn ít nhất 4 người. Random đúng 4 người đấu 2v2.' : `4 người thi đấu · ${selected.size - 4} người ngồi ngoài. Chỉ gửi khi bấm tạo trận.` : selected.size < 2 ? 'Chọn ít nhất 2 người để chia đội.' : selected.size % 2 ? 'Lẻ người: một người sẽ dự bị trận này.' : 'Danh sách chỉ được gửi khi bấm Chia đội.'}</p>
        <p className="text-center text-xs text-stone-500">Nhớ người đã chọn trong 2 giờ sau khi tạo trận.</p>
      </footer>
    </form>
  </main>;
}
