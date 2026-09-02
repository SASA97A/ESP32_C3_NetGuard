import { useState, useEffect, useRef } from 'react';
import { fetchApi, uploadOTA } from './api';

export const TIMEZONES = [
  { label: "(GMT -12:00) Eniwetok, Kwajalein", val: "UTC12" },
  { label: "(GMT -11:00) Midway Island, Samoa", val: "UTC11" },
  { label: "(GMT -10:00) Hawaii", val: "HST10" },
  { label: "(GMT -9:30) Taiohae", val: "UTC9:30" },
  { label: "(GMT -9:00) Alaska", val: "AKST9AKDT,M3.2.0,M11.1.0" },
  { label: "(GMT -8:00) Pacific Time (US & Canada)", val: "PST8PDT,M3.2.0,M11.1.0" },
  { label: "(GMT -7:00) Mountain Time (US & Canada)", val: "MST7MDT,M3.2.0,M11.1.0" },
  { label: "(GMT -6:00) Central Time (US & Canada), Mexico City", val: "CST6CDT,M3.2.0,M11.1.0" },
  { label: "(GMT -5:00) Eastern Time (US & Canada), Bogota, Lima", val: "EST5EDT,M3.2.0,M11.1.0" },
  { label: "(GMT -4:30) Caracas", val: "UTC4:30" },
  { label: "(GMT -4:00) Atlantic Time (Canada), Caracas, La Paz", val: "AST4ADT,M3.2.0,M11.1.0" },
  { label: "(GMT -3:30) Newfoundland", val: "NST3:30NDT,M3.2.0,M11.1.0" },
  { label: "(GMT -3:00) Brazil, Buenos Aires, Georgetown", val: "UTC3" },
  { label: "(GMT -2:00) Mid-Atlantic", val: "UTC2" },
  { label: "(GMT -1:00) Azores, Cape Verde Islands", val: "UTC1" },
  { label: "(GMT) Western Europe Time, London, Lisbon, Casablanca", val: "GMT0BST,M3.5.0/1,M10.5.0" },
  { label: "(GMT +1:00) Brussels, Copenhagen, Madrid, Paris", val: "CET-1CEST,M3.5.0,M10.5.0/3" },
  { label: "(GMT +2:00) Kaliningrad, South Africa", val: "EET-2EEST,M3.5.0/3,M10.5.0/4" },
  { label: "(GMT +3:00) Baghdad, Riyadh, Moscow, St. Petersburg", val: "UTC-3" },
  { label: "(GMT +3:30) Tehran", val: "UTC-3:30" },
  { label: "(GMT +4:00) Abu Dhabi, Muscat, Baku, Tbilisi", val: "UTC-4" },
  { label: "(GMT +4:30) Kabul", val: "UTC-4:30" },
  { label: "(GMT +5:00) Ekaterinburg, Islamabad, Karachi, Tashkent", val: "UTC-5" },
  { label: "(GMT +5:30) Bombay, Calcutta, Madras, New Delhi", val: "UTC-5:30" },
  { label: "(GMT +5:45) Kathmandu, Pokhara", val: "UTC-5:45" },
  { label: "(GMT +6:00) Almaty, Dhaka, Colombo", val: "UTC-6" },
  { label: "(GMT +6:30) Yangon, Mandalay", val: "UTC-6:30" },
  { label: "(GMT +7:00) Bangkok, Hanoi, Jakarta", val: "UTC-7" },
  { label: "(GMT +8:00) Beijing, Perth, Singapore, Hong Kong", val: "UTC-8" },
  { label: "(GMT +8:45) Eucla", val: "UTC-8:45" },
  { label: "(GMT +9:00) Tokyo, Seoul, Osaka, Sapporo, Yakutsk", val: "UTC-9" },
  { label: "(GMT +9:30) Adelaide, Darwin", val: "ACST-9:30ACDT,M10.1.0,M4.1.0/3" },
  { label: "(GMT +10:00) Eastern Australia, Guam, Vladivostok", val: "AEST-10AEDT,M10.1.0,M4.1.0/3" },
  { label: "(GMT +10:30) Lord Howe Island", val: "UTC-10:30" },
  { label: "(GMT +11:00) Magadan, Solomon Islands, New Caledonia", val: "UTC-11" },
  { label: "(GMT +11:30) Norfolk Island", val: "UTC-11:30" },
  { label: "(GMT +12:00) Auckland, Wellington, Fiji, Kamchatka", val: "NZST-12NZDT,M9.5.0,M4.1.0/3" },
  { label: "(GMT +12:45) Chatham Islands", val: "UTC-12:45" },
  { label: "(GMT +13:00) Apia, Nukualofa", val: "UTC-13" },
  { label: "(GMT +14:00) Line Islands, Tokelau", val: "UTC-14" }
];

export default function SettingsView() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [tzMsg, setTzMsg] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  
  const [otaProgress, setOtaProgress] = useState<number | null>(null);
  const [otaError, setOtaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchApi('/stats.json')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          if (data.timezone) setTimezone(data.timezone);
          if (data.version) {
            setFirmwareVersion(data.version);
          } else {
            setFirmwareVersion("Legacy (Pre-v1.0)");
          }
        }
      })
      .catch(() => {
        setFirmwareVersion("Offline");
      });

    fetch('https://api.github.com/repos/SASA97A/ESP32_C3_NetGuard/releases/latest')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.tag_name) {
          setLatestVersion(data.tag_name);
        }
      })
      .catch(() => {});
  }, []);

  const hasUpdate = firmwareVersion && latestVersion && 
                    firmwareVersion.startsWith('v') && 
                    firmwareVersion !== latestVersion;

  const handleTimezoneChange = async (newTz: string) => {
    setTimezone(newTz);
    setTzMsg('');
    try {
      const statsRes = await fetchApi('/stats.json');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const res = await fetchApi('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timezone: newTz,
            profiles: statsData.profiles || []
          })
        });
        if (res.ok) {
          setTzMsg('Timezone updated successfully.');
          setTimeout(() => setTzMsg(''), 3000);
        } else {
          setTzMsg('Failed to update timezone.');
        }
      }
    } catch {
      setTzMsg('Connection error updating timezone.');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setMsg("Password too short.");
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await fetchApi(`/setpass?old=${encodeURIComponent(oldPassword)}&p=${encodeURIComponent(newPassword)}`, { method: 'POST' });
      if (res.ok) {
        setMsg('Password updated successfully!');
        const authHeader = 'Basic ' + btoa(`admin:${newPassword}`);
        localStorage.setItem('router_auth', authHeader);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else if (res.status === 403) {
        setMsg('Current password incorrect.');
      } else {
        setMsg('Failed to update password.');
      }
    } catch {
      setMsg('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualOta = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setOtaError(null);
    setOtaProgress(0);
    
    try {
      await uploadOTA(file, (pct) => setOtaProgress(pct));
      setOtaProgress(100);
      setOtaError("INFO: Flash complete. Waiting for Gateway to reboot...");
      
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds wait max
      const poll = setInterval(async () => {
        try {
          attempts++;
          const res = await fetchApi('/stats.json', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && data.version) {
              clearInterval(poll);
              if (data.version !== firmwareVersion) {
                setOtaError("SUCCESS: Gateway flashed successfully!");
                setFirmwareVersion(data.version);
              } else {
                setOtaError("ERROR: Firmware upgrade failed.");
              }
              setTimeout(() => {
                setOtaError(null);
                setOtaProgress(null);
              }, 5000);
            }
          }
        } catch (err) {
          // Expected to fail while device is restarting
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            setOtaError("ERROR: Gateway failed to reconnect after 30 seconds.");
            setOtaProgress(null);
          }
        }
      }, 1000);

    } catch (err: any) {
      setOtaError('ERROR: ' + (err.message || 'OTA Upload failed'));
      setOtaProgress(null);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="flex-grow px-container-padding py-section-margin w-full max-w-3xl mx-auto space-y-stack-gap">
      <div className="flex flex-col gap-2 mb-stack-gap border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Configure system timezone, update administrator credentials, and manage firmware.</p>
      </div>

      {/* Timezone Card */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-container-padding transition-all">
        <div className="flex items-center gap-inline-gap mb-4">
          <span className="material-symbols-outlined text-secondary" data-icon="schedule">schedule</span>
          <h2 className="font-headline-md text-headline-md">Timezone</h2>
        </div>
        <div className="flex flex-col gap-base">
          <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="timezone-select">System Timezone</label>
          <select
            className="font-label-md text-label-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
            id="timezone-select"
            value={timezone}
            onChange={e => handleTimezoneChange(e.target.value)}
          >
            <option value="">Select Timezone...</option>
            {TIMEZONES.map(tz => (
              <option key={tz.val} value={tz.val}>{tz.label}</option>
            ))}
          </select>
          {tzMsg && <div className="text-xs font-medium text-primary mt-1">{tzMsg}</div>}
        </div>
      </section>

      {/* Authentication Security Card */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-container-padding transition-all">
        <div className="flex items-center gap-inline-gap mb-4">
          <span className="material-symbols-outlined text-secondary" data-icon="lock">lock</span>
          <h2 className="font-headline-md text-headline-md">Authentication Security</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-stack-gap">
          <div className="flex flex-col gap-base">
            <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="old-password">Current Password</label>
            <input
              className="font-body-md text-body-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
              id="old-password"
              placeholder="Enter current password"
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-base">
            <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="new-password">New Password</label>
            <input
              className="font-body-md text-body-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
              id="new-password"
              placeholder="Enter new password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-base">
            <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="confirm-password">Confirm Password</label>
            <input
              className="font-body-md text-body-md bg-surface border border-outline-variant rounded px-3 py-2 w-full focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
              id="confirm-password"
              placeholder="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>
          {msg && <div className={`text-sm font-medium ${msg.includes('successfully') ? 'text-green-600' : 'text-error'}`}>{msg}</div>}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded flex items-center justify-center min-w-[120px] min-h-[44px] hover:bg-primary-container transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>

      {/* System Information Card */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-container-padding transition-all">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-inline-gap">
            <span className="material-symbols-outlined text-secondary">info</span>
            <h2 className="font-headline-md text-headline-md">System Information</h2>
          </div>
        </div>
        
        {hasUpdate && (
          <div className="bg-surface-container-lowest text-on-surface p-4 rounded-lg mb-4 flex items-start gap-3 border-l-4 border-l-primary border border-outline-variant/60 shadow-sm">
            <span className="material-symbols-outlined text-primary shrink-0 mt-0.5">update</span>
            <div className="w-full">
              <p className="font-label-md text-label-md font-bold mb-1">Update Available: {latestVersion}</p>
              <p className="font-body-md text-body-md text-sm text-on-surface-variant mb-3">
                Download the latest firmware binary from GitHub and flash it here to upgrade your gateway safely.
              </p>
              <div className="flex gap-2 items-center">
                <a 
                  href="https://github.com/SASA97A/ESP32_C3_NetGuard/releases/latest" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded hover:opacity-90 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Get .bin File
                </a>
              </div>
            </div>
          </div>
        )}

        {otaProgress !== null && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="font-label-sm text-on-surface-variant">Firmware Upload</span>
              <span className="font-label-sm text-primary">{otaProgress}%</span>
            </div>
            <div className="w-full bg-surface-variant rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300" 
                style={{ width: `${otaProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {otaError && (
          <div className={`p-3 rounded mb-4 text-sm font-medium border ${
            otaError.startsWith('SUCCESS') 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : otaError.startsWith('INFO') 
                ? 'bg-secondary-container text-on-secondary-container border-outline-variant/50' 
                : 'bg-error-container text-error border-error/20'
          }`}>
            {otaError.replace(/^(SUCCESS|INFO|ERROR):\s*/, '')}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-body-md text-on-surface-variant">Firmware Version</span>
            <span className="font-label-md font-mono bg-surface-container-low px-2 py-1 rounded text-on-surface w-fit border border-outline-variant">
              {firmwareVersion ? firmwareVersion : 'Loading...'}
            </span>
          </div>

          <div className="flex items-center">
            <input 
              type="file" 
              accept=".bin" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <button
              onClick={handleManualOta}
              disabled={otaProgress !== null && otaProgress < 100}
              className="flex items-center gap-1.5 font-label-md text-label-md bg-surface text-on-surface border border-outline-variant px-4 py-2 rounded shadow-sm hover:bg-surface-container-low active:scale-95 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">publish</span>
              Flash Firmware
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
