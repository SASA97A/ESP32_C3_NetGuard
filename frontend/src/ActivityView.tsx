import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from './api';
import type { Client, QueryLogResponse, QueryReason, StatsResponse } from './interfaces';

const REASONS: Record<QueryReason, { label: string; cls: string }> = {
  0: { label: 'ALLOWED', cls: 'bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]' },
  1: { label: 'BLOCKLIST', cls: 'bg-error-container text-on-error-container border border-error/50' },
  2: { label: 'MANUAL', cls: 'bg-error-container text-on-error-container border border-error/50' },
  3: { label: 'BEDTIME', cls: 'bg-error-container text-on-error-container border border-error/50' },
  4: { label: 'APP LIMIT', cls: 'bg-[#FEF9C3] text-[#854d0e] border border-[#FDE047]' },
  5: { label: 'ENCRYPTED DNS', cls: 'bg-[#FEF9C3] text-[#854d0e] border border-[#FDE047]' },
};

const VALID_EPOCH = 1700000000;

function formatTime(t: number, now: number): string {
  if (now >= VALID_EPOCH && t >= VALID_EPOCH) {
    return new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  const ago = Math.max(0, now - t);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
}

export default function ActivityView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [data, setData] = useState<QueryLogResponse | null>(null);
  const [mac, setMac] = useState('');
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (mac) params.set('mac', mac);
      if (onlyBlocked) params.set('blocked', '1');
      const qs = params.toString();
      const [logRes, statsRes] = await Promise.all([
        fetchApi(`/api/log${qs ? `?${qs}` : ''}`, { cache: 'no-store' }),
        fetchApi('/stats.json', { cache: 'no-store' }),
      ]);
      if (logRes.ok) {
        setData(await logRes.json());
        setError(null);
      } else {
        setError(`Failed to load activity (Status ${logRes.status})`);
      }
      if (statsRes.ok) {
        const stats: StatsResponse = await statsRes.json();
        setClients((stats.clients || []).filter(c => c && c.mac && c.mac !== '00:00:00:00:00:00'));
      }
    } catch {
      setError('Connection error while loading activity.');
    }
  }, [mac, onlyBlocked]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const nameFor = (m: string, ip: string) => {
    const c = clients.find(x => x.mac.toLowerCase() === m.toLowerCase());
    return c?.name || (m !== '00:00:00:00:00:00' ? m : ip);
  };

  const top = data?.top || [];
  const maxTop = top.length ? top[0].n : 1;

  return (
    <div className="max-w-4xl mx-auto p-container-padding space-y-section-margin pt-stack-gap">
      <div className="flex flex-col gap-2 border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Activity</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Recent DNS lookups per device and the most blocked domains. Kept in memory only and cleared when the gateway restarts.
        </p>
      </div>

      {error && (
        <div className="bg-error-container text-error p-3 rounded-lg border border-error/20 font-label-md text-label-md">{error}</div>
      )}

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[20px]">block</span>
          <h2 className="font-headline-md text-headline-md text-on-surface">Top Blocked</h2>
        </div>
        {top.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">Nothing blocked yet.</p>
        ) : (
          <ul className="space-y-2">
            {top.slice(0, 10).map(t => (
              <li key={t.d} className="space-y-1">
                <div className="flex justify-between gap-3 font-label-md text-label-md">
                  <span className="font-mono text-on-surface truncate">{t.d}</span>
                  <span className="text-on-surface-variant shrink-0">{t.n}</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-1.5">
                  <div className="bg-error h-1.5 rounded-full" style={{ width: `${Math.max(4, (t.n / maxTop) * 100)}%` }}></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[20px]">history</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Query Log</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              className="bg-surface border border-outline-variant rounded-lg px-2 py-1 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary max-w-[220px]"
            >
              <option value="">All devices</option>
              {clients.map(c => (
                <option key={c.mac} value={c.mac}>
                  {(c.name || c.mac) + (c.q ? ` (${c.b || 0}/${c.q} blocked)` : '')}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={onlyBlocked}
                onChange={(e) => setOnlyBlocked(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Blocked only
            </label>
          </div>
        </div>
        {!data || data.log.length === 0 ? (
          <p className="p-6 text-center text-on-surface-variant font-body-md">No queries recorded yet.</p>
        ) : (
          <ul className="divide-y divide-surface-variant">
            {data.log.map((e, i) => (
              <li key={`${e.t}-${i}`} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span className="font-label-sm text-label-sm text-outline w-20 shrink-0">{formatTime(e.t, data.now)}</span>
                <span className="font-label-md text-label-md text-on-surface-variant sm:w-40 shrink-0 truncate">{nameFor(e.mac, e.ip)}</span>
                <span className="font-label-md text-label-md font-mono text-on-surface flex-1 min-w-0 break-all">{e.d}</span>
                <span className={`inline-block w-fit px-2 py-0.5 rounded font-label-sm text-[10px] font-bold shrink-0 ${REASONS[e.r]?.cls ?? ''}`}>
                  {REASONS[e.r]?.label ?? e.r}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
