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
        <section className="mb-section-margin">
          <div className="flex flex-col gap-2">
            <label htmlFor="profile-select" className="font-label-md text-label-md text-on-surface-variant ml-1">Select Profile</label>
            <div className="relative">
              <select 
                id="profile-select" 
                value={activeProfileIdx}
                onChange={(e) => setActiveProfileIdx(Number(e.target.value))}
                className="w-full appearance-none bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 font-label-md text-label-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
              >
                {profiles.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {idx === 0 ? "Default" : (p.name || `Group ${idx + 1}`)}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                  <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>
        </section>

        {/* Timer Mode Setting */}
        <section className="mb-section-margin">
          <div className="bg-secondary-container rounded-xl p-4">
            <p className="font-label-md text-label-md text-on-secondary-container mb-3 font-semibold">When {activeProfile.name || 'this group'} hits its Bedtime schedule:</p>
            <div className="flex gap-stack-gap">
              <button 
                onClick={() => onUpdateProfileField(activeProfileIdx, 'mode', 0)}
                className={`flex-1 border rounded-lg p-3 flex flex-col items-center justify-center text-center transition-colors ${
                  (activeProfile.mode || 0) === 0 
                  ? 'bg-primary border-primary relative overflow-hidden shadow-sm' 
                  : 'bg-surface border-outline-variant hover:bg-surface-container-high'
                }`}
              >
                {(activeProfile.mode || 0) === 0 && <div className="absolute inset-0 bg-white opacity-10"></div>}
                <span className={`material-symbols-outlined mb-1 ${
                  (activeProfile.mode || 0) === 0 ? 'text-on-primary' : 'text-on-surface-variant'
                }`}>wifi_off</span>
                <span className={`font-label-sm text-label-sm ${
                  (activeProfile.mode || 0) === 0 ? 'text-on-primary' : 'text-on-surface-variant'
                }`}>Hard Blackout<br/>(Offline)</span>
              </button>

              <button 
                onClick={() => onUpdateProfileField(activeProfileIdx, 'mode', 1)}
                className={`flex-1 border rounded-lg p-3 flex flex-col items-center justify-center text-center transition-colors ${
                  (activeProfile.mode || 0) === 1 
                  ? 'bg-primary border-primary relative overflow-hidden shadow-sm' 
                  : 'bg-surface border-outline-variant hover:bg-surface-container-high'
                }`}
              >
                {(activeProfile.mode || 0) === 1 && <div className="absolute inset-0 bg-white opacity-10"></div>}
                <span className={`material-symbols-outlined mb-1 ${
                  (activeProfile.mode || 0) === 1 ? 'text-on-primary' : 'text-on-surface-variant'
                }`}>app_blocking</span>
                <span className={`font-label-sm text-label-sm ${
                  (activeProfile.mode || 0) === 1 ? 'text-on-primary' : 'text-on-surface-variant'
                }`}>Soft limits<br/>(Block Apps)</span>
              </button>
            </div>
          </div>
        </section>

        {/* Quick Filters */}
        <section className="mb-section-margin">
          <h2 className="font-headline-md text-headline-md text-on-background mb-4">Quick Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {PREDEFINED_APPS.map(app => {
                const active = hasApp(app.domains);
                
                // Construct the logo styling per Stitch design
                let logoChar = app.label.charAt(0);
                let logoBg = "bg-white";
                let logoText = "text-on-surface";
                
                if (app.id === 'meta') { logoChar = 'f'; logoText = 'text-[#1877F2]'; }
                else if (app.id === 'tiktok') { logoChar = 't'; logoBg = 'bg-black'; logoText = 'text-white'; }
                else if (app.id === 'youtube') { logoChar = '▶'; logoText = 'text-red-600'; }
                else if (app.id === 'reddit') { logoChar = 'r'; logoText = 'text-orange-500'; }
                else if (app.id === 'twitter') { logoChar = 'X'; logoBg = 'bg-black'; logoText = 'text-white'; }

                return (
                  <button
                    key={app.id}
                    onClick={() => handleToggleApp(app.domains)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border active:scale-[0.98] transition-all ${
                      active 
                      ? 'bg-[#FEE2E2] border-[#FECACA]' 
                      : 'bg-surface border-outline-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm text-lg font-bold ${logoBg} ${logoText}`}>
                        {logoChar}
                      </div>
                      <span className={`font-body-lg text-body-lg font-semibold ${
                        active ? 'text-[#991B1B]' : 'text-on-surface'
                      }`}>{app.label}</span>
                    </div>
                    <span className={`material-symbols-outlined ${
                      active ? 'text-[#991B1B]' : 'text-on-surface-variant'
                    }`}>
                      {active ? 'block' : 'check_circle'}
                    </span>
                  </button>
                );
              })}
          </div>
        </section>

        {/* Custom Limits */}
        <section className="mb-section-margin">
          <h2 className="font-headline-md text-headline-md text-on-background mb-4">Custom Limits</h2>
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">language</span>
            <input 
              type="text" 
              placeholder="Type a web domain and press Enter (e.g. reddit.com)"
              onKeyDown={handleCustomAdd}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-3 font-label-md text-label-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-20">
            {(activeProfile.limits || []).map((domain, i) => {
              const isManaged = PREDEFINED_APPS.some(app => app.domains.includes(domain));
              return (
                <div 
                  key={i} 
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-label-sm text-label-sm border ${
                    isManaged 
                    ? 'bg-surface-variant text-on-surface-variant border-outline-variant opacity-70' 
                    : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                  }`}
                >
                  {domain}
                  {isManaged ? (
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                  ) : (
                    <button onClick={() => handleCustomRemove(domain)} className="hover:text-red-800 focus:outline-none ml-1">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="fixed bottom-16 md:bottom-20 md:absolute md:rounded-b-xl left-0 w-full bg-surface/90 md:bg-surface backdrop-blur-sm border-t border-outline-variant p-4 z-40">
           <button 
             onClick={onSaveProfiles}
             disabled={savingProfiles}
             className="w-full bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-label-md text-label-md py-3.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
           >
             <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>save</span>
             {savingProfiles ? 'Applying rules...' : 'Apply App Limits'}
           </button>
        </div>

      </div>
    </div>
  );
}