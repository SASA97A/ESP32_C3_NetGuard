import { useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setMsg("Password too short."); return;
    }
    setLoading(true);
    setMsg('');
    try {
      // POST requires parameters as application/x-www-form-urlencoded or URL params
      const res = await fetchApi('/setpass?p=' + encodeURIComponent(newPassword), { method: 'POST' });
      if (res.ok) {
        setMsg('Password updated successfully!');
        // Update local storage
        const authHeader = 'Basic ' + btoa(`admin:${newPassword}`);
        localStorage.setItem('router_auth', authHeader);
        setNewPassword('');
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
    <div className="space-y-8 pb-20">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 px-4 sm:px-0">System Settings</h2>
      
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mx-4 sm:mx-0">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Change Dashboard Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
          </div>
          {msg && <div className="text-sm font-medium text-blue-600">{msg}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-500 text-white font-semibold rounded-full py-2 px-4 shadow active:scale-95 transition-transform disabled:bg-blue-300">
            {loading ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
