import { useState, useEffect } from 'react';
import type { Client, Profile } from './interfaces';
import { fetchApi } from './api';

interface ClientTableProps {
  clients: Client[];
  profiles: Profile[];
  onRefresh: () => void;
}

interface ClientRowProps {
  client: Client;
  profiles: Profile[];
  onUpdate: (mac: string, profileId: number, name: string) => Promise<void>;
}

function ClientRow({ client, profiles, onUpdate }: ClientRowProps) {
  const [name, setName] = useState(client.name || '');

  useEffect(() => {
    setName(client.name || '');
  }, [client.name]);

  const handleNameBlur = () => {
    if (name !== client.name) {
      onUpdate(client.mac, client.profile, name);
    }
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPid = parseInt(e.target.value, 10);
    onUpdate(client.mac, newPid, name);
  };

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-200">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Unnamed device"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
        {client.ip || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
        {client.mac}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <select
          value={client.profile}
          onChange={handleProfileChange}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {profiles.map((p, idx) => (
            <option key={idx} value={idx}>
              {p.name || `Profile ${idx}`}
            </option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {client.blocked ? (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            Blocked
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Allowed
          </span>
        )}
      </td>
    </tr>
  );
}

export default function ClientTable({ clients, profiles, onRefresh }: ClientTableProps) {
  const [addMac, setAddMac] = useState('');
  const [addName, setAddName] = useState('');
  const [addProfile, setAddProfile] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const validClients = clients.filter(c => c && c.mac && c.mac !== "00:00:00:00:00:00");

  const handleAssign = async (mac: string, profile: number, name?: string) => {
    let url = `/api/assign?mac=${encodeURIComponent(mac)}&profile=${profile}`;
    if (name) {
      url += `&name=${encodeURIComponent(name)}`;
    }
    await fetchApi(url, { method: 'POST' });
    onRefresh();
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMac.trim()) return;
    setSubmitting(true);
    try {
      await handleAssign(addMac.trim(), addProfile, addName.trim());
      setAddMac('');
      setAddName('');
      setAddProfile(0);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Connected Devices ({validClients.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MAC Address</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Profile</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {validClients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  No connected devices found.
                </td>
              </tr>
            ) : (
              validClients.map((client) => (
                <ClientRow
                  key={client.mac}
                  client={client}
                  profiles={profiles}
                  onUpdate={handleAssign}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-6 bg-gray-50 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Manually Add / Assign Client</h4>
        <form onSubmit={handleAddSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">MAC Address</label>
            <input
              type="text"
              required
              placeholder="AA:BB:CC:DD:EE:FF"
              value={addMac}
              onChange={(e) => setAddMac(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Device Name</label>
            <input
              type="text"
              placeholder="e.g. John's iPad"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Profile</label>
            <select
              value={addProfile}
              onChange={(e) => setAddProfile(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {profiles.map((p, idx) => (
                <option key={idx} value={idx}>
                  {p.name || `Profile ${idx}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-500 text-white font-semibold rounded-full py-3 px-4 w-full shadow active:scale-95 transition-transform"
            >
              {submitting ? 'Adding...' : 'Add Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
