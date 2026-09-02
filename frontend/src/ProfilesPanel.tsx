import { useState, useEffect, useRef } from 'react';
import type { Profile } from './interfaces';

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

interface ProfilesPanelProps {
  profiles: Profile[];
  onUpdateProfileField: <K extends keyof Profile>(index: number, field: K, value: Profile[K]) => void;
  onSaveProfiles: () => Promise<void>;
  savingProfiles?: boolean;
  onAddProfile?: () => void;
  onRemoveProfile?: (idx: number) => void;
  removingIdx?: number | null;
}

export default function ProfilesPanel({
  profiles,
  onUpdateProfileField,
  onSaveProfiles,
  savingProfiles = false,
  onAddProfile,
  onRemoveProfile,
  removingIdx = null,
}: ProfilesPanelProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const prevLengthRef = useRef(profiles.length);

  useEffect(() => {
    if (profiles.length > prevLengthRef.current) {
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
      setEditingIdx(profiles.length - 1);
    }
    prevLengthRef.current = profiles.length;
  }, [profiles.length]);

  return (
    <section className="space-y-stack-gap pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant pb-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Access Profiles</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Manage network access schedules and default DNS routing for groups.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-gap">
        {profiles.map((prof, idx) => (
          <div
            key={idx}
            className={`bg-surface-container-lowest border border-outline-variant rounded-xl origin-top transition-all duration-300 overflow-hidden hover:shadow-[0px_4px_12px_rgba(0,0,0,0.05)] ${
              removingIdx === idx
                ? 'opacity-0 scale-95 max-h-0 !p-0 !border-0 !m-0 space-y-0'
                : 'opacity-100 scale-100 max-h-[1000px] p-4 space-y-4'
            }`}
          >
            <div className="flex justify-between items-center border-b border-surface-variant pb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {idx === 0 ? "Default" : (prof.name || `Profile ${idx + 1}`)}
                </h3>
                {idx === 0 && (
                  <span className="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Base Profile
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {onRemoveProfile && (
                  <button
                    type="button"
                    onClick={() => idx !== 0 && onRemoveProfile(idx)}
                    disabled={idx === 0}
                    className={`rounded-full p-3 transition-colors flex items-center justify-center ${
                      idx === 0 
                        ? 'text-on-surface-variant opacity-30 cursor-not-allowed' 
                        : 'text-error hover:bg-error-container active:scale-95'
                    }`}
                    title={idx === 0 ? "Cannot remove Base Profile" : "Remove Profile"}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={idx === 0 ? "Default" : (prof.name || '')}
                  disabled={idx === 0 || editingIdx !== idx}
                  onChange={(e) => onUpdateProfileField(idx, 'name', e.target.value)}
                  placeholder={`Profile ${idx + 1}`}
                  className={`w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-opacity ${
                    idx === 0 || editingIdx !== idx ? 'opacity-50 bg-surface-container-low cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Bedtime Start
                  </label>
                  <input
                    type="time"
                    value={parseMinToString(prof.start)}
                    disabled={editingIdx !== idx}
                    onChange={(e) => onUpdateProfileField(idx, 'start', parseStringToMin(e.target.value))}
                    className={`w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-opacity ${
                      editingIdx !== idx ? 'opacity-50 bg-surface-container-low cursor-not-allowed' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Bedtime End
                  </label>
                  <input
                    type="time"
                    value={parseMinToString(prof.end)}
                    disabled={editingIdx !== idx}
                    onChange={(e) => onUpdateProfileField(idx, 'end', parseStringToMin(e.target.value))}
                    className={`w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-opacity ${
                      editingIdx !== idx ? 'opacity-50 bg-surface-container-low cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-stack-gap">
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Primary DNS
                  </label>
                  <input
                    type="text"
                    value={prof.dns || ''}
                    disabled={editingIdx !== idx}
                    onChange={(e) => onUpdateProfileField(idx, 'dns', e.target.value)}
                    placeholder="e.g. 1.1.1.1"
                    className={`w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface font-mono focus:ring-1 focus:ring-primary focus:border-primary transition-opacity ${
                      editingIdx !== idx ? 'opacity-50 bg-surface-container-low cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-surface-variant">
              {editingIdx === idx ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingIdx(null)}
                    className="flex-1 bg-surface-variant text-on-surface-variant font-label-md text-label-md px-3 py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveProfiles();
                      setEditingIdx(null);
                    }}
                    disabled={savingProfiles}
                    className="flex-1 bg-primary text-on-primary font-label-md text-label-md px-3 py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-50"
                  >
                    {savingProfiles ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingIdx(idx)}
                  className="w-full bg-primary text-on-primary font-label-md text-label-md px-3 py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {onAddProfile && (
        <button
          type="button"
          onClick={onAddProfile}
          className="fixed right-6 z-50 bg-primary text-on-primary w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all bottom-24 md:bottom-8"
          title="Add Profile"
        >
          <span className="material-symbols-outlined text-[28px]">add</span>
        </button>
      )}
    </section>
  );
}
