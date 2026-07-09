import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type UserSearchResult = { id: string; username: string; displayName: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Fired when a user is picked from the dropdown. */
  onSelect: (user: UserSearchResult) => void;
  /** Logged-in user id — attached as x-user-id for the search API. */
  userId: string | null;
  placeholder?: string;
  /** Tailwind classes for the <input> (the wrapper is relative flex-1). */
  inputClassName?: string;
  /** Usernames already in the tournament/league — hidden from results. */
  excludeUsernames?: string[];
};

const DEFAULT_INPUT =
  'w-full bg-stone-50 border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 font-semibold';

/**
 * Debounced user-search dropdown. Types → 250ms debounce → GET /api/users/search
 * → dropdown → pick → onSelect. Min 2 chars. Keyboard: ↑/↓/Enter/Esc.
 */
export function UserSearchInput({
  value,
  onChange,
  onSelect,
  userId,
  placeholder,
  inputClassName,
  excludeUsernames,
}: Props) {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const excludeKey = (excludeUsernames ?? []).join(',');

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      reqId.current++; // retire any in-flight request so it can't reopen the dropdown
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const myReq = ++reqId.current;
      try {
        const headers: Record<string, string> = {};
        if (userId) headers['x-user-id'] = userId;
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { headers });
        if (!res.ok) { if (myReq === reqId.current) { setResults([]); setOpen(false); } return; }
        const data = await res.json();
        if (myReq !== reqId.current) return; // stale response
        let users: UserSearchResult[] = Array.isArray(data?.users) ? data.users : [];
        if (excludeKey) {
          const ex = new Set(excludeKey.split(',').filter(Boolean).map((u) => u.toLowerCase()));
          users = users.filter((u) => !ex.has(u.username.toLowerCase()));
        }
        setResults(users);
        setActive(-1);
        setOpen(users.length > 0);
      } catch {
        if (myReq === reqId.current) { setResults([]); setOpen(false); }
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, userId, excludeKey]);

  // close on click outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (u: UserSearchResult) => {
    onSelect(u);
    setOpen(false);
    setResults([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder={placeholder || 'username'}
        autoComplete="off"
        className={inputClassName || DEFAULT_INPUT}
      />
      {loading && (
        <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((u, i) => (
            <button
              type="button"
              key={u.id}
              // mousedown so the pick fires before click-outside/blur closes the list
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer ${i === active ? 'bg-orange-50' : 'hover:bg-stone-50'}`}
            >
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {u.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-stone-800 truncate">{u.displayName}</div>
                <div className="text-[10px] text-stone-400 font-mono truncate">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
