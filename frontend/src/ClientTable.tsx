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
  onForget: (mac: string) => void;
}

function ClientRow({ client, profiles, onUpdate, onForget }: ClientRowProps) {
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

  const assignedProfile = profiles[client.profile] || profiles[0];
  const isAppLimitsMode = assignedProfile?.mode === 1;
  const hasAppLimits = assignedProfile?.limits && assignedProfile.limits.length > 0;

  const isManualBlocked = Boolean(client.manualBlock);
  const isTimerHardBlocked = Boolean(!client.manualBlock && client.blocked && !isAppLimitsMode);
  const isTimerLimited = Boolean(!client.manualBlock && client.blocked && isAppLimitsMode && hasAppLimits);

  const isActuallyBlocked = isManualBlocked || isTimerHardBlocked;

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
                isActuallyBlocked ? "bg-error-container text-on-error-container border border-error/50" : 
                isTimerLimited ? "bg-[#FEF9C3] text-[#854d0e] border border-[#FDE047]" : 
                "bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]"
              }`}>
                {isActuallyBlocked ? "BLOCKED" : isTimerLimited ? "LIMITED" : "ALLOWED"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-4 md:ml-0 md:float-right">
            <button
              type="button"
              onClick={handleEditClick}
              className="text-primary hover:bg-surface-variant rounded-full p-2 transition-colors flex items-center justify-center active:scale-95"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
            <button
              type="button"
              onClick={handleToggleBlock}
              className={client.manualBlock
                ? "text-primary hover:bg-surface-variant rounded-full p-2 transition-colors flex items-center justify-center active:scale-95"
                : "text-error hover:bg-error-container rounded-full p-2 transition-colors flex items-center justify-center active:scale-95"
              }
              title={client.manualBlock ? "Unblock" : "Block"}
            >
              <span className="material-symbols-outlined text-[20px]">
                {client.manualBlock ? "check_circle" : "block"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onForget(client.mac)}
              className="text-error hover:bg-error-container rounded-full p-2 transition-colors flex items-center justify-center active:scale-95"
              title="Forget Device"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>
      </td>

      <td className="p-0 md:px-4 md:py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 md:table-cell md:align-middle">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="font-label-md text-label-md font-mono text-secondary">
            <div className={`text-on-surface ${!client.ip || client.ip === '0.0.0.0' || client.ip === '0' ? 'text-on-surface-variant italic' : ''}`}>
              {!client.ip || client.ip === '0.0.0.0' || client.ip === '0' ? 'Offline / Pending' : client.ip}
            </div>
            <div className="text-xs text-outline">{client.mac}</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-label-sm text-outline uppercase">Profile:</label>
            <select
              value={client.profile}
              onChange={handleProfileChange}
              className="bg-transparent border-none p-0 focus:ring-0 font-body-md text-primary w-32 cursor-pointer hover:bg-surface-variant px-1 rounded transition-colors text-right md:text-left"
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
  const [pendingForget, setPendingForget] = useState<string | null>(null);

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

  const executeForget = async () => {
    if (!pendingForget) return;
    const url = `/api/assign?mac=${encodeURIComponent(pendingForget)}&forget=true`;
    await fetchApi(url, { method: 'POST' });
    setPendingForget(null);
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
      <div className="flex flex-col gap-2 border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Connected Clients</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Identify devices on your network, assign access profiles, or set manual blocks.</p>
      </div>
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
                    onForget={setPendingForget}
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
                Profile
              </label>
              <select
                value={addProfile}
                onChange={(e) => setAddProfile(parseInt(e.target.value, 10))}
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

      {pendingForget !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#000000]/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant p-6 max-w-sm w-full mx-auto space-y-4">
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined text-[24px]">warning</span>
              <h3 className="font-headline-md text-headline-md text-on-surface">Forget Device?</h3>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Are you sure you want to forget this device <strong>({pendingForget})</strong>? If it reconnects to your network, it will reappear as an unnamed device in the Default group.
            </p>
            <div className="flex gap-3 pt-2">
              <button 
                className="flex-1 border border-outline text-on-surface-variant font-label-md text-label-md px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
                onClick={() => setPendingForget(null)}
              >
                Cancel
              </button>
              <button 
                className="flex-1 bg-error text-on-error font-label-md text-label-md px-4 py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all"
                onClick={executeForget}
              >
                Forget
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
