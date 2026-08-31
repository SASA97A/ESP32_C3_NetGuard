import { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(client.name || '');
  }, [client.name]);

  const handleNameBlur = () => {
    if (name !== client.name) {
      onUpdate(client.mac, client.profile, name, client.manualBlock);
    }
  };

  const handleEditClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
    <tr className="hover:bg-surface-container-low transition-colors group flex flex-col p-4 md:p-4 gap-3 border-b border-surface-variant md:table-row md:border-b-0">
      <td className="p-0 md:px-4 md:py-3 flex items-start justify-between md:table-cell md:align-middle">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="bg-surface-variant p-2 rounded-lg text-on-surface shrink-0">
              <span className="material-symbols-outlined text-sm">devices</span>
            </div>
            <div className="flex flex-col items-start">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="Unnamed device"
                className="bg-transparent border-none p-0 focus:ring-0 font-body-md text-on-surface w-32 md:w-48 cursor-text hover:bg-surface-variant px-1 rounded transition-colors"
              />
              <span className={`inline-block px-2 py-0.5 rounded font-label-sm text-[10px] font-bold mt-1 ${
                isBlocked ? "status-blocked" : "status-allowed"
              }`}>
                {isBlocked ? "BLOCKED" : "ALLOWED"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 ml-4 md:ml-0 md:float-right">
            <button
              type="button"
              onClick={handleEditClick}
              className="text-primary hover:bg-surface-variant rounded-full p-3 transition-colors flex items-center justify-center active:scale-95"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
            <button
              type="button"
              onClick={handleToggleBlock}
              className={client.manualBlock
                ? "text-primary hover:bg-surface-variant rounded-full p-3 transition-colors flex items-center justify-center active:scale-95"
                : "text-error hover:bg-error-container rounded-full p-3 transition-colors flex items-center justify-center active:scale-95"
              }
              title={client.manualBlock ? "Unblock" : "Block"}
            >
              <span className="material-symbols-outlined text-[20px]">
                {client.manualBlock ? "check_circle" : "block"}
              </span>
            </button>
          </div>
        </div>
      </td>

      <td className="p-0 md:px-4 md:py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 md:table-cell md:align-middle">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
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
                  {idx === 0 ? "Default" : (p.name || `Profile ${idx + 1}`)}
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
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-4">
          Manually Add / Assign Client
        </h3>
        <form onSubmit={handleAddSubmit} className="flex flex-col md:flex-row gap-4 items-end">
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
                    {idx === 0 ? "Default" : (p.name || `Profile ${idx + 1}`)}
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
    </section>
  );
}
