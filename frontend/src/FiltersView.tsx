import { useState } from 'react';
import type { Profile } from './interfaces';

interface FiltersViewProps {
  profiles: Profile[];
  onUpdateProfileField: <K extends keyof Profile>(index: number, field: K, value: Profile[K]) => void;
  onSaveProfiles: () => Promise<void>;
  savingProfiles?: boolean;
}

const PREDEFINED_APPS = [
  { id: 'meta', label: 'Meta (FB/Insta/WhatsApp)', domains: ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'fb.com', 'whatsapp.com', 'whatsapp.net'] },
  { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'musical.ly'] },
  { id: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com'] },
  { id: 'roblox', label: 'Roblox / Gaming', domains: ['roblox.com', 'rbxcdn.com', 'epicgames.com'] },
  { id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'redditmedia.com'] },
  { id: 'twitter', label: 'X / Twitter', domains: ['twitter.com', 'twimg.com', 'x.com'] }
];

export default function FiltersView({ profiles, onUpdateProfileField, onSaveProfiles, savingProfiles }: FiltersViewProps) {
  const [activeProfileIdx, setActiveProfileIdx] = useState<number>(0);
  const activeProfile = profiles[activeProfileIdx];

  const handleToggleApp = (appDomains: string[]) => {
    let currentLimits = activeProfile.limits || [];
    
    // Check if the app is fully blocked (all domains present)
    const isBlocked = appDomains.every(d => currentLimits.includes(d));

    if (isBlocked) {
      // Remove all domains of this app
      currentLimits = currentLimits.filter(d => !appDomains.includes(d));
    } else {
      // Add all missing domains of this app
      currentLimits = [...currentLimits, ...appDomains.filter(d => !currentLimits.includes(d))];
    }
    
    onUpdateProfileField(activeProfileIdx, 'limits', currentLimits);
  };

  const hasApp = (appDomains: string[]) => {
    const limits = activeProfile?.limits || [];
    if (limits.length === 0) return false;
    return appDomains.every(d => limits.includes(d));
  };

  const handleCustomAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      let domain = e.currentTarget.value.trim().toLowerCase();
      // basic sanitization
      domain = domain.replace(/https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
      
      const limits = activeProfile?.limits || [];
      if (!limits.includes(domain)) {
        onUpdateProfileField(activeProfileIdx, 'limits', [...limits, domain]);
      }
      e.currentTarget.value = '';
    }
  };

  const handleCustomRemove = (domain: string) => {
    const limits = activeProfile?.limits || [];
    onUpdateProfileField(activeProfileIdx, 'limits', limits.filter(d => d !== domain));
  };

  if (!activeProfile) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full">
      <div className="flex flex-col gap-2">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">App Limits</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">Block access to specific apps and websites. Limits only apply when the profile's Bedtime timer is active and set to 'App Limits' mode.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 md:p-6 shadow-sm">
        
        {/* Profile Selector */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-surface-variant overflow-x-auto">
          {profiles.map((p, idx) => (
            <button 
              key={idx}
              onClick={() => setActiveProfileIdx(idx)}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-label-md transition-colors ${
                activeProfileIdx === idx 
                  ? 'bg-primary text-on-primary' 
                  : 'bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {idx === 0 ? "Default Group" : (p.name || `Group ${idx + 1}`)}
            </button>
          ))}
        </div>

        {/* Timer Mode Setting */}
        <div className="mb-8 p-4 bg-primary-container/20 rounded-lg border border-primary/20">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Timer Enforcement</h3>
            <p className="font-body-sm text-on-surface-variant mb-4">When {activeProfile.name || 'this group'} hits its Bedtime schedule:</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-surface border border-outline-variant rounded-lg hover:border-primary transition-colors flex-1">
                <input 
                  type="radio" 
                  name="bedtimeMode" 
                  checked={(activeProfile.mode || 0) === 0}
                  onChange={() => onUpdateProfileField(activeProfileIdx, 'mode', 0)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="font-label-md text-on-surface">Hard Blackout (Offline)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-surface border border-outline-variant rounded-lg hover:border-primary transition-colors flex-1">
                <input 
                  type="radio" 
                  name="bedtimeMode" 
                  checked={(activeProfile.mode || 0) === 1}
                  onChange={() => onUpdateProfileField(activeProfileIdx, 'mode', 1)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="font-label-md text-on-surface">Soft limits (Block Apps)</span>
              </label>
            </div>
        </div>

        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4">Quick Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {PREDEFINED_APPS.map(app => {
              const active = hasApp(app.domains);
              return (
                <button
                  key={app.id}
                  onClick={() => handleToggleApp(app.domains)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all active:scale-95 ${
                    active 
                    ? 'bg-error-container text-on-error-container border-error' 
                    : 'bg-surface text-on-surface border-outline-variant hover:border-primary'
                  }`}
                >
                  <span className="font-label-lg">{app.label}</span>
                  <span className="material-symbols-outlined">
                    {active ? 'block' : 'check_circle'}
                  </span>
                </button>
              );
            })}
        </div>

        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4">Custom Limits</h3>
        <div className="mb-4">
          <input 
            type="text" 
            placeholder="Type a web domain and press Enter (e.g. reddit.com)"
            onKeyDown={handleCustomAdd}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 font-body-md text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {(activeProfile.limits || []).map((domain, i) => {
            // Check if it belongs to a predefined app to grey it out (managed above)
            const isManaged = PREDEFINED_APPS.some(app => app.domains.includes(domain));
            return (
              <span 
                key={i} 
                className={`flex items-center gap-2 px-3 py-1 rounded-full font-label-md text-sm border ${
                  isManaged 
                  ? 'bg-surface-variant text-on-surface-variant border-transparent' 
                  : 'bg-error-container text-error border-error-container'
                }`}
              >
                {domain}
                {!isManaged && (
                  <button onClick={() => handleCustomRemove(domain)} className="hover:text-on-error transition-colors">
                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                  </button>
                )}
              </span>
            );
          })}
        </div>

        <div className="pt-6 border-t border-surface-variant flex justify-end">
           <button 
             onClick={onSaveProfiles}
             disabled={savingProfiles}
             className="bg-primary text-on-primary px-6 py-2 rounded-full font-label-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
           >
             <span className="material-symbols-outlined text-[20px]">save</span>
             {savingProfiles ? 'Applying rules...' : 'Apply App Limits'}
           </button>
        </div>

      </div>
    </div>
  );
}