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
  saveMessage?: string | null;
}

export default function ProfilesPanel({
  profiles,
  onUpdateProfileField,
  onSaveProfiles,
  savingProfiles = false,
  saveMessage = null,
}: ProfilesPanelProps) {
  return (
    <section className="space-y-stack-gap">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant pb-2">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background">Access Profiles</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Manage network access schedules and DNS routing.
          </p>
        </div>
        {saveMessage && (
          <span className={`font-label-md text-label-md ${saveMessage.includes('failed') ? 'text-error' : 'text-[#065F46]'}`}>
            {saveMessage}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-gap">
        {profiles.map((prof, idx) => (
          <div
            key={idx}
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-4 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.05)] transition-shadow"
          >
            <div className="flex justify-between items-center border-b border-surface-variant pb-2">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {prof.name || `Profile ${idx + 1}`}
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={prof.name || ''}
                  onChange={(e) => onUpdateProfileField(idx, 'name', e.target.value)}
                  placeholder={`Group ${idx + 1}`}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
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
                    onChange={(e) => onUpdateProfileField(idx, 'start', parseStringToMin(e.target.value))}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Bedtime End
                  </label>
                  <input
                    type="time"
                    value={parseMinToString(prof.end)}
                    onChange={(e) => onUpdateProfileField(idx, 'end', parseStringToMin(e.target.value))}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
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
                    onChange={(e) => onUpdateProfileField(idx, 'dns', e.target.value)}
                    placeholder="e.g. 1.1.1.1"
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface font-mono focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-surface-variant">
              <button
                type="button"
                onClick={() => onSaveProfiles()}
                disabled={savingProfiles}
                className="w-full bg-primary text-on-primary font-label-md text-label-md px-3 py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-50"
              >
                {savingProfiles ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
