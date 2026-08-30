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
  onUpdate: (mac: string, profileId: number, name?: string, block?: boolean) => Promise<void>;
}

function ClientRow({ client, profiles, onUpdate }: ClientRowProps) {
  const [name, setName] = useState(client.name || '');

  useEffect(() => {
    setName(client.name || '');
  }, [client.name]);

  const handleNameBlur = () => {
    if (name !== client.name) {
      onUpdate(client.mac, client.profile, name, client.manualBlock);
    }
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPid = parseInt(e.target.value, 10);
    onUpdate(client.mac, newPid, name, client.manualBlock);
  };

  const handleToggleBlock = () => {
    onUpdate(client.mac, client.profile, name, !client.manualBlock);
  };

  const isBlocked = Boolean(client.manualBlock || client.blocked);

  return (
    <tr className="hover:bg-surface-container-low transition-colors group flex flex-col md:table-row p-4 md:p-0 gap-3 border-b border-surface-variant md:border-b-0">
      <td className="p-2 md:p-4">
        <div className="flex items-center gap-3">
          <div className="bg-surface-variant p-2 rounded-lg text-on-surface">
            <span className="material-symbols-outlined text-sm">devices</span>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Unnamed device"
            className="bg-transparent border border-transparent focus:border-outline-variant hover:bg-surface-variant p-1 font-body-md text-on-surface rounded transition-colors focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      </td>

      <td className="p-2 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleToggleBlock}
            className={client.manualBlock
              ? "text-primary hover:bg-surface-variant rounded px-2 py-1 transition-colors flex items-center gap-1 active:scale-95"
              : "text-error hover:bg-error-container rounded px-2 py-1 transition-colors flex items-center gap-1 active:scale-95"
            }
          >
            <span className="material-symbols-outlined text-[16px]">
              {client.manualBlock ? "check_circle" : "block"}
            </span>
            <span className="font-label-sm">
              {client.manualBlock ? "Unblock" : "Block"}
            </span>
          </button>
          <span className={`inline-block px-2 py-1 rounded font-label-sm text-label-sm font-bold ${
            isBlocked ? "status-blocked" : "status-allowed"
          }`}>
            {isBlocked ? "BLOCKED" : "ALLOWED"}
          </span>
        </div>
      </td>

      <td className="p-2 md:p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="font-label-md text-label-md font-mono text-secondary">
            <div className="text-on-surface">{client.ip || '-'}</div>
            <div className="text-xs text-outline">{client.mac}</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-label-sm text-outline uppercase">Group:</label>
            <select
              value={client.profile}
              onChange={handleProfileChange}
              className="bg-surface border border-outline-variant rounded-lg px-2 py-1 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {profiles.map((p, idx) => (
                <option key={idx} value={idx}>
                  {p.name || `Profile ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>
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

  const handleAssign = async (mac: string, profile: number, name?: string, block?: boolean) => {
    let url = `/api/assign?mac=${encodeURIComponent(mac)}&profile=${profile}`;
    if (name !== undefined) {
      url += `&name=${encodeURIComponent(name)}`;
    }
    if (block !== undefined) {
      url += `&block=${block}`;
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
    <section className="space-y-stack-gap">
      <h2 className="font-headline-md text-headline-md text-on-background border-b border-outline-variant pb-2">
        Connected Clients ({validClients.length})
      </h2>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <tbody className="font-body-md text-body-md divide-y divide-surface-variant">
              {validClients.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-on-surface-variant font-body-md">
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

        <div className="p-4 bg-surface-container-low border-t border-outline-variant">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-3">
            Manually Add / Assign Client
          </h3>
          <form onSubmit={handleAddSubmit} className="flex flex-col md:flex-row gap-3 items-end">
            <div className="w-full md:w-auto flex-1">
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                MAC Address
              </label>
              <input
                type="text"
                required
                placeholder="00:11:22:33:44:55"
                value={addMac}
                onChange={(e) => setAddMac(e.target.value)}
                className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md font-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="w-full md:w-auto flex-1">
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                Friendly Name
              </label>
              <input
                type="text"
                placeholder="Device Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="w-full md:w-auto">
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                Group
              </label>
              <select
                value={addProfile}
                onChange={(e) => setAddProfile(Number(e.target.value))}
                className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
              >
                {profiles.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {p.name || `Profile ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:w-auto bg-primary text-on-primary font-label-md text-label-md px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap h-[38px] disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Device'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
