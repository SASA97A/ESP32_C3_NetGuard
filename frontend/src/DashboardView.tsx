import { useState, useEffect, useCallback } from 'react';
import type { StatsResponse, Profile } from './interfaces';
import { fetchApi } from './api';
import ClientTable from './ClientTable';
import ProfilesPanel from './ProfilesPanel';

interface DashboardViewProps {
  activeTab?: string;
  tab?: string;
}

export default function DashboardView({ activeTab, tab }: DashboardViewProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local editable state for profiles and timezone
  const [timezone, setTimezone] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isFormInitialized, setIsFormInitialized] = useState(false);
  const [savingProfiles, setSavingProfiles] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);

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

  const handleAddProfile = () => {
    if (profiles.length >= 10) {
      alert("Maximum 10 groups allowed.");
      return;
    }
    setProfiles([...profiles, { name: "New Group", start: -1, end: -1, dns: "1.1.1.1" }]);
  };

  const handleRemoveProfile = (idx: number) => {
    setPendingRemove(idx);
  };

  const confirmRemoveProfile = () => {
    if (pendingRemove === null) return;
    const idxToRemove = pendingRemove;
    
    setPendingRemove(null);
    setRemovingIdx(idxToRemove);
    
    setTimeout(() => {
      setProfiles((prev) => prev.filter((_, i) => i !== idxToRemove));
      setRemovingIdx(null);
    }, 300);
  };

  const currentTab = tab || activeTab || 'home';

  if (loading && !stats) {
    return (
      <div className="max-w-4xl mx-auto p-container-padding space-y-section-margin pt-stack-gap">
        <div className="flex items-center justify-center gap-2 text-on-surface-variant animate-pulse mb-6">
          <span className="material-symbols-outlined text-[20px]">sync</span>
          <span className="font-label-md text-label-md">Connecting to Gateway...</span>
        </div>
        
        <div className="animate-pulse space-y-section-margin">
          {currentTab === 'home' && (
          <>
            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col items-center">
              <div className="h-6 bg-surface-variant/50 rounded w-1/3 mb-6"></div>
              <div className="w-48 h-48 rounded-full bg-surface-variant/50 mb-6"></div>
              <div className="flex w-full justify-around mt-2">
                <div className="h-4 bg-surface-variant/50 rounded w-1/4"></div>
                <div className="h-4 bg-surface-variant/50 rounded w-1/4"></div>
              </div>
            </section>
            
            <section className="grid grid-cols-2 md:grid-cols-3 gap-stack-gap">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`bg-surface-container-lowest border border-outline-variant rounded-lg p-4 flex flex-col items-start h-24 ${i === 2 ? 'col-span-2 md:col-span-1' : ''}`}>
                  <div className="h-5 bg-surface-variant/50 rounded w-1/2 mb-3"></div>
                  <div className="h-4 bg-surface-variant/50 rounded w-3/4"></div>
                </div>
              ))}
            </section>
          </>
        )}

        {(currentTab === 'groups' || currentTab === 'profiles') && (
          <section className="space-y-stack-gap">
            <div className="border-b border-outline-variant pb-2">
              <div className="h-8 bg-surface-variant/50 rounded w-1/3"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-gap">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 h-64 flex flex-col gap-4">
                  <div className="h-6 bg-surface-variant/50 rounded w-1/2"></div>
                  <div className="flex-1 bg-surface-variant/30 rounded w-full"></div>
                  <div className="h-10 bg-surface-variant/50 rounded w-full"></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(currentTab === 'devices' || currentTab === 'clients') && (
          <section className="space-y-stack-gap">
            <div className="border-b border-outline-variant pb-2">
              <div className="h-8 bg-surface-variant/50 rounded w-1/3"></div>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
               <div className="divide-y divide-surface-variant">
                 {[...Array(5)].map((_, i) => (
                   <div key={i} className="p-4 flex flex-col md:flex-row gap-4 h-24 items-center justify-between">
                     <div className="h-8 w-1/3 bg-surface-variant/50 rounded"></div>
                     <div className="h-8 w-1/4 bg-surface-variant/50 rounded"></div>
                   </div>
                 ))}
               </div>
            </div>
          </section>
        )}
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
        <div className="relative w-24 h-24 mb-6 text-primary shrink-0 mx-auto">
          <span className="material-symbols-outlined absolute inset-0 text-[96px] opacity-20">wifi</span>
          <span className="material-symbols-outlined absolute inset-0 text-[96px] animate-wifi-search">wifi</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">
          Gateway Unreachable
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Make sure your device is powered on and you are connected to the correct Wi-Fi network. Retrying automatically...
        </p>
      </div>
    );
  }

  const validDashClients = stats?.clients 
    ? stats.clients.filter(c => c && c.mac && c.mac !== "00:00:00:00:00:00") 
    : [];
  
  const totalClients = validDashClients.length;
  const allowedClients = validDashClients.filter(c => !c.blocked && !c.manualBlock).length;
  const blockedClients = totalClients - allowedClients;
  const allowedPct = totalClients > 0 ? Math.round((allowedClients / totalClients) * 100) : 100;

  const showOverview = currentTab === 'home';
  const showProfilesOnly = currentTab === 'groups' || currentTab === 'profiles';
  const showClientsOnly = currentTab === 'devices' || currentTab === 'clients';

  return (
    <div className="max-w-4xl mx-auto p-container-padding space-y-section-margin pt-stack-gap">
      {/* Disconnection Warning Banner */}
      {error && stats && (
        <div className="bg-error text-on-error p-3 rounded-lg border border-error/50 flex items-center gap-3 shadow-sm">
          <div className="relative shrink-0 w-[24px] h-[24px]">
            <span className="material-symbols-outlined absolute inset-0 opacity-30">wifi</span>
            <span className="material-symbols-outlined absolute inset-0 animate-wifi-search">wifi</span>
          </div>
          <span className="font-label-md text-label-md">
            Disconnected: The gateway is unreachable. Attempting to reconnect...
          </span>
        </div>
      )}

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
        </>
      )}

      {showProfilesOnly && (
        <ProfilesPanel
          profiles={profiles}
          onUpdateProfileField={updateProfileField}
          onSaveProfiles={() => handleSaveProfiles()}
          savingProfiles={savingProfiles}
          saveMessage={saveMessage}
          onAddProfile={handleAddProfile}
          onRemoveProfile={handleRemoveProfile}
          removingIdx={removingIdx}
        />
      )}

      {showClientsOnly && (
        <ClientTable
          clients={stats?.clients || []}
          profiles={profiles.length > 0 ? profiles : stats?.profiles || []}
          onRefresh={fetchStats}
        />
      )}

      {/* Confirmation Modal */}
      {pendingRemove !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#000000]/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant p-6 max-w-sm w-full mx-auto space-y-4">
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined text-[24px]">warning</span>
              <h3 className="font-headline-md text-headline-md text-on-surface">Delete Group?</h3>
            </div>
            
            <p className="font-body-md text-body-md text-on-surface-variant">
              {(stats?.clients || []).filter(c => c.profile === pendingRemove).length > 0 
                ? `WARNING: There are ${(stats?.clients || []).filter(c => c.profile === pendingRemove).length} device(s) mapped to this group. If you delete it, they will default out to the "Default" group. Are you absolutely certain?`
                : "Are you sure you want to remove this group?"}
            </p>
            
            <div className="flex gap-3 pt-2">
              <button 
                className="flex-1 border border-outline text-on-surface-variant font-label-md text-label-md px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
                onClick={() => setPendingRemove(null)}
              >
                Cancel
              </button>
              <button 
                className="flex-1 bg-error text-on-error font-label-md text-label-md px-4 py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all"
                onClick={confirmRemoveProfile}
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
