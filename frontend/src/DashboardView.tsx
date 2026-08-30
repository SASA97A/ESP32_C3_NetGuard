import { useState, useEffect, useCallback } from 'react';
import type { StatsResponse, Profile } from './interfaces';
import { fetchApi } from './api';
import ClientTable from './ClientTable';
import ProfilesPanel from './ProfilesPanel';
import { TIMEZONES } from './SettingsView';

interface DashboardViewProps {
  activeTab?: string;
}

export default function DashboardView({ activeTab }: DashboardViewProps) {
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-on-surface-variant font-body-md">Loading Dashboard...</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-error-container border border-error text-on-error-container px-6 py-4 rounded-lg">
          <p className="font-headline-md text-headline-md">Error</p>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      </div>
    );
  }

  const totalClients = stats?.clients ? stats.clients.length : 0;
  const allowedClients = stats?.clients ? stats.clients.filter(c => !c.blocked && !c.manualBlock).length : 0;
  const blockedClients = totalClients - allowedClients;
  const allowedPct = totalClients > 0 ? Math.round((allowedClients / totalClients) * 100) : 100;

  const showProfilesOnly = activeTab === 'groups' || activeTab === 'profiles';
  const showClientsOnly = activeTab === 'devices' || activeTab === 'clients';
  const showOverview = !showProfilesOnly && !showClientsOnly;

  return (
    <div className="max-w-4xl mx-auto p-container-padding space-y-section-margin pt-stack-gap">
      {showOverview && (
        <>
          {/* Hero Section: Connected Clients Donut Chart */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col items-center">
            <h2 className="font-headline-md text-headline-md mb-4 text-on-surface">Connected Clients</h2>
            <div
              className="relative w-48 h-48 rounded-full flex items-center justify-center mb-6"
              style={{ background: `conic-gradient(#10B981 0% ${allowedPct}%, #EF4444 ${allowedPct}% 100%)` }}
            >
              <div className="absolute inset-2 bg-surface-container-lowest rounded-full flex flex-col items-center justify-center">
                <span className="font-headline-lg text-headline-lg text-on-surface">{totalClients}</span>
                <span className="font-body-md text-body-md text-on-surface-variant">Total</span>
              </div>
            </div>
            <div className="flex w-full justify-around mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-[#065F46]">{allowedClients} Allowed</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]"></div>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-[#991B1B]">{blockedClients} Blocked</span>
                </div>
              </div>
            </div>
          </section>

          {/* System Metrics Grid */}
          <section className="grid grid-cols-2 md:grid-cols-3 gap-stack-gap">
            {/* Uptime Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 flex flex-col items-start hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">schedule</span>
                <span className="font-body-md text-body-md text-on-surface-variant">Uptime</span>
              </div>
              <span className="font-label-md text-label-md text-on-surface">{stats?.uptime || 'N/A'}</span>
            </div>
            {/* Temperature Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 flex flex-col items-start hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">device_thermostat</span>
                <span className="font-body-md text-body-md text-on-surface-variant">Temperature</span>
              </div>
              <span className="font-label-md text-label-md text-on-surface">
                {stats?.temp !== undefined ? `${stats.temp.toFixed(1)} °C` : 'N/A'}
              </span>
            </div>
            {/* Free Heap Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 flex flex-col items-start hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-shadow col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">memory</span>
                <span className="font-body-md text-body-md text-on-surface-variant">Free Heap</span>
              </div>
              <span className="font-label-md text-label-md text-on-surface">
                {stats?.heap !== undefined ? `${Math.round(stats.heap / 1024)} KB` : 'N/A'}
              </span>
            </div>
          </section>

          {/* Timezone Configuration */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Timezone Configuration</h3>
            <div className="max-w-xs">
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Timezone (TZ String)</label>
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  handleSaveProfiles(e.target.value, profiles);
                }}
                className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="">Select Timezone...</option>
                {TIMEZONES.map(tz => <option key={tz.val} value={tz.val}>{tz.label}</option>)}
              </select>
              <p className="font-label-sm text-label-sm text-outline mt-1">Saves automatically when selection changes.</p>
            </div>
          </section>
        </>
      )}

      {(showOverview || showProfilesOnly) && (
        <ProfilesPanel
          profiles={profiles}
          onUpdateProfileField={updateProfileField}
          onSaveProfiles={() => handleSaveProfiles()}
          savingProfiles={savingProfiles}
          saveMessage={saveMessage}
        />
      )}

      {(showOverview || showClientsOnly) && (
        <ClientTable
          clients={stats?.clients || []}
          profiles={profiles.length > 0 ? profiles : stats?.profiles || []}
          onRefresh={fetchStats}
        />
      )}
    </div>
  );
}
