import { useState, useEffect, useCallback } from 'react';
import type { StatsResponse, Profile } from './interfaces';
import { fetchApi } from './api';
import ClientTable from './ClientTable';
import { TIMEZONES } from './SettingsView';

export function parseMinToString(m: number): string {
  if (m === undefined || m === null || m < 0 || isNaN(m)) return '';
  const hours = Math.floor(m / 60) % 24;
  const mins = m % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function parseStringToMin(s: string): number {
  if (!s) return -1;
  const [hStr, mStr] = s.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

export default function DashboardView() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local editable state for profiles and timezone
  const [timezone, setTimezone] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isFormInitialized, setIsFormInitialized] = useState(false);
  const [savingProfiles, setSavingProfiles] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetchApi('/stats.json');
      if (res.ok) {
        const data: StatsResponse = await res.json();
        if (data.token) {
          localStorage.setItem('router_session_token', data.token);
        }
        setStats(data);
        setError(null);
        if (!isFormInitialized) {
          setTimezone(data.timezone || '');
          setProfiles(data.profiles || []);
          setIsFormInitialized(true);
        }
      } else {
        setError(`Failed to fetch stats (Status ${res.status})`);
      }
    } catch (err) {
      setError('Connection error while fetching stats.');
    } finally {
      setLoading(false);
    }
  }, [isFormInitialized]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleSaveProfiles = async (tzToSave = timezone, profsToSave = profiles) => {
    setSavingProfiles(true);
    setSaveMessage(null);
    try {
      const res = await fetchApi('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timezone: tzToSave,
          profiles: profsToSave,
        }),
      });

      if (res.ok) {
        setSaveMessage('Profiles saved successfully!');
        setTimeout(() => setSaveMessage(null), 3000);
        fetchStats();
      } else {
        setSaveMessage(`Save failed (Status ${res.status})`);
      }
    } catch (err) {
      setSaveMessage('Failed to save profiles.');
    } finally {
      setSavingProfiles(false);
    }
  };

  const updateProfileField = <K extends keyof Profile>(
    index: number,
    field: K,
    value: Profile[K]
  ) => {
    setProfiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-gray-500 font-medium">Loading Dashboard...</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Metrics Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">System Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 shadow border border-gray-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Uptime</span>
            <p className="mt-2 text-3xl font-extrabold text-indigo-600">{stats?.uptime || 'N/A'}</p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow border border-gray-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Temperature</span>
            <p className="mt-2 text-3xl font-extrabold text-amber-600">
              {stats?.temp !== undefined ? `${stats.temp.toFixed(1)} °C` : 'N/A'}
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow border border-gray-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Free Heap</span>
            <p className="mt-2 text-3xl font-extrabold text-emerald-600">
              {stats?.heap !== undefined ? `${Math.round(stats.heap / 1024)} KB` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Timezone Configuration */}
      <div className="bg-white rounded-lg p-6 shadow border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Timezone Configuration</h3>
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-700 mb-1">Timezone (TZ String)</label>
          <select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              handleSaveProfiles(e.target.value, profiles);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
          >
            <option value="">Select Timezone...</option>
            {TIMEZONES.map(tz => <option key={tz.val} value={tz.val}>{tz.label}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">Saves automatically when selection changes.</p>
        </div>
      </div>

      {/* Profile Management Form */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Access Profiles & Schedules</h3>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMessage}
            </span>
          )}
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {profiles.map((prof, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
                <h4 className="font-semibold text-gray-800 text-base">Profile {idx}</h4>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Profile Name</label>
                  <input
                    type="text"
                    value={prof.name || ''}
                    onChange={(e) => updateProfileField(idx, 'name', e.target.value)}
                    placeholder={`Profile ${idx}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Bedtime Start</label>
                    <input
                      type="time"
                      value={parseMinToString(prof.start)}
                      onChange={(e) => updateProfileField(idx, 'start', parseStringToMin(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Bedtime End</label>
                    <input
                      type="time"
                      value={parseMinToString(prof.end)}
                      onChange={(e) => updateProfileField(idx, 'end', parseStringToMin(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Upstream DNS</label>
                  <input
                    type="text"
                    value={prof.dns || ''}
                    onChange={(e) => updateProfileField(idx, 'dns', e.target.value)}
                    placeholder="1.1.1.1"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleSaveProfiles()}
              disabled={savingProfiles}
              className="rounded-md border border-transparent bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300"
            >
              {savingProfiles ? 'Saving...' : 'Save Profiles'}
            </button>
          </div>
        </div>
      </div>

      {/* Connected Clients */}
      {stats && (
        <ClientTable
          clients={stats.clients || []}
          profiles={profiles.length > 0 ? profiles : stats.profiles || []}
          onRefresh={fetchStats}
        />
      )}
    </div>
  );
}
