import React, { useEffect, useRef, useState } from 'react';
import { Send, RefreshCw } from 'lucide-react';

type Status = {
  botUsername: string; owner: boolean; link: { telegram_id: string } | null;
  integration: { chat_id: string; chat_title: string; enabled: number; auto_post: number; health: string | null } | null;
  pending: Array<{ hash: string; purpose: string; telegram_id: string; chat_id: string | null; chat_title: string | null }>;
  failed: Array<{ id: string; status: string; error: string }>;
};
export default function BiLacTelegramSettings({ tournamentId, userId, request }: {
  tournamentId: string; userId: string | null; request: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [command, setCommand] = useState('');
  const requestRef = useRef(request);
  requestRef.current = request;
  const generation = useRef(0);
  const scope = `${tournamentId}:${userId ?? ''}`;
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) { scopeRef.current = scope; generation.current++; }
  async function call(path: string, body?: object, method = 'POST') {
    const epoch = generation.current;
    const response = await requestRef.current(`/api/telegram/settings/${path}`, {
      method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({ error: 'Máy chủ chưa hỗ trợ Telegram. Hãy dùng bản Worker.' }));
    if (epoch !== generation.current) throw new Error('Phạm vi giải đấu đã thay đổi.');
    if (!response.ok) throw new Error(data.error || 'Không thể kết nối Telegram.');
    return data;
  }
  async function refresh(epoch = generation.current) {
    const response = await requestRef.current('/api/telegram/capabilities', { cache: 'no-store' });
    const capability = await response.json().catch(() => ({ enabled: false }));
    if (epoch !== generation.current) return;
    const available = response.ok && capability.enabled === true;
    setEnabled(available);
    if (!available) { setStatus(null); return; }
    const data = await call('status', undefined, 'GET');
    if (epoch === generation.current) setStatus(data);
  }
  useEffect(() => {
    const epoch = ++generation.current;
    setEnabled(false); setStatus(null); setLink(''); setCommand(''); setError(''); setNotice(''); setBusy(false);
    void refresh(epoch).catch(e => { if (epoch === generation.current) setError(e.message); });
    return () => { generation.current++; };
  }, [tournamentId, userId]);
  async function act(action: () => Promise<void>) {
    const epoch = generation.current;
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (epoch === generation.current) await refresh(epoch); }
    catch (e) { if (epoch === generation.current) setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  if (!enabled) return null;
  const button = 'px-3 py-2 min-h-10 rounded-lg bg-stone-100 text-stone-800 text-sm font-semibold hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50';
  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3" aria-labelledby="telegram-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="telegram-title" className="font-bold flex items-center gap-2"><Send className="w-4 h-4" /> Telegram của giải</h3>
        <button type="button" className={button} disabled={busy} onClick={() => void act(async () => { await refresh(); })} aria-label="Làm mới trạng thái Telegram"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-stone-600">Chia đội, thêm người, nhập kết quả, và xem BXH ngay trong group. Tự động đăng BXH lúc 13:20 và 21:00 mỗi ngày, giờ Việt Nam.</p>
      <div role="status" aria-live="polite" className="text-sm">{busy && 'Đang xử lý…'}{notice && <p className="text-green-700">{notice}</p>}</div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {status && <>
        <p className="text-sm">Bot: <a className="underline text-orange-700" href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">@{status.botUsername}</a></p>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm">{status.link ? `Đã liên kết Telegram ID: ${status.link.telegram_id}` : 'Bạn chưa liên kết tài khoản Telegram.'}</span>
          {!status.link && <button className={button} disabled={busy} onClick={() => void act(async () => { const data = await call('token', { purpose: 'account' }); setLink(data.url); })}>1. Tạo link liên kết tài khoản</button>}
          {status.link && <button className={button} disabled={busy} onClick={() => void act(async () => { await call('link', undefined, 'DELETE'); setLink(''); setCommand(''); })}>Ngắt liên kết tài khoản</button>}
        </div>
        {link && <p className="text-sm"><a className="underline text-orange-700" href={link} target="_blank" rel="noreferrer">Mở bot và bấm Start</a>, rồi quay lại đây bấm làm mới và xác nhận đúng Telegram ID. Link hết hạn sau 10 phút.</p>}
        {status.integration && <div className="text-sm space-y-1">
          <p className="font-semibold">Group: {status.integration.chat_title} ({status.integration.chat_id})</p>
          <p>{status.integration.enabled ? 'Đã kết nối' : 'Bot đã rời group, hãy kết nối lại.'} · {status.integration.auto_post ? 'Đang bật lịch đăng BXH' : 'Đã tạm dừng lịch đăng BXH'}</p>
          {status.integration.health && <p className="text-amber-800">Tình trạng gửi tin: {status.integration.health}</p>}
        </div>}
        {status.owner && <>
          <p className="text-sm text-stone-600">Thêm bot làm quản trị viên group để kiểm tra quyền người kết nối. Kết nối đồng nghĩa đồng ý chia sẻ BXH với thành viên group.</p>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={busy || !status.link} onClick={() => void act(async () => { const data = await call('token', { purpose: 'group' }); setCommand(data.command); })}>2. Tạo mã kết nối group</button>
            {status.integration && <>
              <button className={button} disabled={busy} onClick={() => void act(async () => { await call('config', { test: true }); setNotice('Đã xếp lịch gửi BXH thử. Kiểm tra group rồi làm mới trạng thái.'); })}>Gửi BXH thử vào group</button>
              <button className={button} disabled={busy} onClick={() => void act(async () => { await call('config', { autoPost: !status.integration!.auto_post }); })}>{status.integration.auto_post ? 'Tạm dừng lịch đăng' : 'Bật lịch đăng'}</button>
              <button className={button} disabled={busy} onClick={() => void act(async () => { await call('config', { disconnect: true }); setCommand(''); })}>Ngắt kết nối group</button>
            </>}
          </div>
          {command && <div className="space-y-2 text-sm"><p>Gửi lệnh dưới đây trong group bằng tài khoản Telegram đã liên kết. Sau đó quay lại bấm làm mới và xác nhận group.</p><textarea aria-label="Lệnh kết nối group" readOnly value={command} rows={3} className="w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-xs break-all" /><p>Mã dùng một lần, hết hạn sau 10 phút.</p></div>}
        </>}
        {status.pending.map(p => <div key={p.hash} className="rounded-lg border border-orange-200 bg-white p-3 text-sm space-y-2">
          <p>{p.purpose === 'account' ? `Xác nhận Telegram ID ${p.telegram_id} là của bạn?` : `Kết nối group ${p.chat_title} (${p.chat_id}) và chia sẻ BXH?`}</p>
          <button className={button} disabled={busy} onClick={() => void act(async () => { await call('confirm', { id: p.hash }); setLink(''); setCommand(''); })}>Xác nhận {p.purpose === 'account' ? 'tài khoản' : 'group'}</button>
        </div>)}
        {status.failed.length > 0 && <div className="text-sm text-amber-800"><p>Tin chưa gửi được hoặc chưa rõ trạng thái. Kiểm tra group trước khi gửi thử lại:</p>{status.failed.map(job => <p key={job.id}>{job.status}: {job.error}</p>)}</div>}
        <p className="text-xs text-stone-500 break-words">Lệnh: /help@{status.botUsername}, /random@{status.botUsername}, /addplayer@{status.botUsername} Tên, /score@{status.botUsername} mã-trận 10 7, /bxh@{status.botUsername}.</p>
      </>}
    </section>
  );
}
