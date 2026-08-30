import { useState, useEffect } from 'react';
import { fetchApi } from './api';

export const TIMEZONES = [
  { label: "Eastern Time (US & Canada)", val: "EST5EDT,M3.2.0,M11.1.0" },
  { label: "Central Time (US & Canada)", val: "CST6CDT,M3.2.0,M11.1.0" },
  { label: "Mountain Time (US & Canada)", val: "MST7MDT,M3.2.0,M11.1.0" },
  { label: "Pacific Time (US & Canada)", val: "PST8PDT,M3.2.0,M11.1.0" },
  { label: "London / UK", val: "GMT0BST,M3.5.0/1,M10.5.0" },
  { label: "Central Europe", val: "CET-1CEST,M3.5.0,M10.5.0/3" },
  { label: "Australia / Sydney", val: "AEST-10AEDT,M10.1.0,M4.1.0/3" },
  { label: "UTC", val: "UTC0" }
];

export default function SettingsView() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [tzMsg, setTzMsg] = useState('');

  useEffect(() => {
    fetchApi('/stats.json')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.timezone) {
          setTimezone(data.timezone);
        }
      })
      .catch(() => {});
  }, []);

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
      const res = await fetchApi('/setpass?p=' + encodeURIComponent(newPassword), { method: 'POST' });
      if (res.ok) {
        setMsg('Password updated successfully!');
        const authHeader = 'Basic ' + btoa(`admin:${newPassword}`);
        localStorage.setItem('router_auth', authHeader);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMsg('Failed to update password.');
      }
    } catch {
      setMsg('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow px-container-padding py-section-margin w-full max-w-3xl mx-auto space-y-stack-gap">
      <h1 className="font-headline-lg text-headline-lg mb-stack-gap">Settings</h1>

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
    </main>
  );
}
