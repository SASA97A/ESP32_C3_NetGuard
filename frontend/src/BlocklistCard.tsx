import { useState, useEffect, useRef } from 'react';
import { fetchApi } from './api';
import type { BlocklistInfo, StatsResponse } from './interfaces';

const SUGGESTED_LISTS = [
  { label: 'Ads & Malware', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts' },
  { label: 'Adult Content', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts' },
];

const INTERVALS = [6, 12, 24, 48, 168];

export default function BlocklistCard() {
  const [info, setInfo] = useState<BlocklistInfo | null>(null);
  const [urls, setUrls] = useState('');
  const [interval, setIntervalH] = useState(24);
  const [custom, setCustom] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async (syncForm: boolean) => {
    const res = await fetchApi('/stats.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data: StatsResponse = await res.json();
    if (data.blocklist) {
      setInfo(data.blocklist);
      if (syncForm) {
        setUrls(data.blocklist.url.split(/[\s,]+/).filter(Boolean).join('\n'));
        setIntervalH(data.blocklist.interval || 24);
      }
    }
    setCustom(data.custom || []);
    return data.blocklist || null;
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const bl = await load(false);
        if (bl && !bl.running) stopPolling();
      } catch {
        // device busy; keep polling
      }
    }, 3000);
  };

  useEffect(() => {
    load(true)
      .then(bl => { if (bl?.running) startPolling(); })
      .catch(() => {});
    return stopPolling;
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setMsg('');
    try {
      const u = urls.split(/[\s,]+/).filter(Boolean).join(' ');
      const res = await fetchApi(`/setupdate?u=${encodeURIComponent(u)}&h=${interval}`, { method: 'POST' });
      setMsg(res.ok ? 'Blocklist settings saved.' : 'Failed to save settings.');
      if (res.ok) await load(false);
    } catch {
      setMsg('Connection error.');
    } finally {
      setSaving(false);
    }
  };

  const fetchNow = async () => {
    setMsg('');
    try {
      const res = await fetchApi('/fetchnow', { method: 'POST' });
      if (res.ok) {
        startPolling();
        await load(false);
      } else {
        setMsg(await res.text());
      }
    } catch {
      setMsg('Connection error.');
    }
  };

  const toggleSuggested = (url: string) => {
    const list = urls.split(/[\s,]+/).filter(Boolean);
    const next = list.includes(url) ? list.filter(u => u !== url) : [...list, url];
    setUrls(next.join('\n'));
  };

  const updateCustom = async (param: 'add' | 'remove', domain: string) => {
    setMsg('');
    try {
      const res = await fetchApi(`/api/custom?${param}=${encodeURIComponent(domain)}`, { method: 'POST' });
      if (res.ok) {
        setCustom(await res.json());
        if (param === 'add') setNewDomain('');
      } else {
        setMsg(await res.text());
      }
    } catch {
      setMsg('Connection error.');
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const domain = newDomain.trim().toLowerCase().replace(/https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    if (domain) updateCustom('add', domain);
  };

  const urlList = urls.split(/[\s,]+/).filter(Boolean);
  const statusOk = info?.status.startsWith('ok');

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-container-padding transition-all">
      <div className="flex items-center gap-inline-gap mb-4">
        <span className="material-symbols-outlined text-secondary">block</span>
        <h2 className="font-headline-md text-headline-md">Blocklist</h2>
      </div>

      <div className="space-y-stack-gap">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-label-md font-mono bg-surface-container-low px-2 py-1 rounded text-on-surface border border-outline-variant">
            {info ? `${info.count.toLocaleString()} domains` : 'Loading...'}
          </span>
          {info && (
            <span className={`font-label-sm text-label-sm ${info.running ? 'text-primary' : statusOk ? 'text-green-600' : 'text-on-surface-variant'}`}>
              {info.running ? `Updating: ${info.status}` : `Last update: ${info.status}`}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-base">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Suggested Lists</span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_LISTS.map(l => (
              <button
                key={l.url}
                type="button"
                onClick={() => toggleSuggested(l.url)}
                className={`font-label-sm text-label-sm px-3 py-1.5 rounded border transition-colors ${
                  urlList.includes(l.url)
                    ? 'bg-secondary-container text-on-secondary-container border-transparent'
                    : 'bg-surface text-on-surface border-outline-variant hover:bg-surface-container-low'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-base">
          <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="bl-urls">List URLs (one per line)</label>
          <textarea
            id="bl-urls"
            rows={3}
            value={urls}
            onChange={e => setUrls(e.target.value)}
            placeholder="https://example.com/hosts.txt"
            className="font-mono text-sm bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
          />
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Accepts hosts files, plain domain lists and adblock-style lists. Lists are merged; flash holds about 150,000 domains in total.
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-base flex-grow">
            <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="bl-interval">Update Every</label>
            <select
              id="bl-interval"
              value={interval}
              onChange={e => setIntervalH(Number(e.target.value))}
              className="font-label-md text-label-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
            >
              {INTERVALS.map(h => (
                <option key={h} value={h}>{h === 168 ? '1 week' : `${h} hours`}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded min-h-[44px] hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={fetchNow}
            disabled={!info?.url || info?.running}
            className="flex items-center justify-center gap-1.5 font-label-md text-label-md bg-surface text-on-surface border border-outline-variant px-4 py-2 rounded min-h-[44px] hover:bg-surface-container-low active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            Update Now
          </button>
        </div>

        <div className="flex flex-col gap-base border-t border-surface-variant pt-4">
          <span className="font-label-md text-label-md text-on-surface">Always Blocked</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Blocked for every device and profile, including subdomains.</span>
          <form onSubmit={handleAddCustom} className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="font-body-md text-body-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
            />
            <button
              type="submit"
              className="bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded min-h-[44px] hover:bg-primary-container transition-colors"
            >
              Add
            </button>
          </form>
          {custom.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {custom.map(d => (
                <span key={d} className="inline-flex items-center gap-1 font-mono text-sm bg-surface-container-low border border-outline-variant rounded px-2 py-1">
                  {d}
                  <button
                    type="button"
                    onClick={() => updateCustom('remove', d)}
                    className="text-on-surface-variant hover:text-error"
                    title={`Unblock ${d}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {msg && <div className={`text-sm font-medium ${msg.includes('saved') ? 'text-green-600' : 'text-error'}`}>{msg}</div>}
      </div>
    </section>
  );
}
