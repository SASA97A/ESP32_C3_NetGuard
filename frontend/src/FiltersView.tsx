import { useState } from 'react';
import type { Profile } from './interfaces';

interface FiltersViewProps {
  profiles: Profile[];
  hasUnsavedChanges?: boolean;
  onUpdateProfileField: <K extends keyof Profile>(index: number, field: K, value: Profile[K]) => void;
  onSaveProfiles: () => Promise<void>;
  savingProfiles?: boolean;
}

const PREDEFINED_APPS = [
  { id: 'meta', label: 'Meta', icon: '/icons/meta.svg', domains: ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'fb.com', 'whatsapp.com', 'whatsapp.net'] },
  { id: 'tiktok', label: 'TikTok', icon: '/icons/tiktok.svg', domains: ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'musical.ly'] },
  { id: 'youtube', label: 'YouTube', icon: '/icons/youtube.svg', domains: ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com'] },
  { id: 'snapchat', label: 'Snapchat', icon: '/icons/snapchat.svg', domains: ['snapchat.com', 'sc-cdn.net', 'snapads.com'] },
  { id: 'discord', label: 'Discord', icon: '/icons/discord.svg', domains: ['discord.com', 'discordapp.com', 'discord.gg'] },
  { id: 'twitch', label: 'Twitch', icon: '/icons/twitch.svg', domains: ['twitch.tv', 'ttvnw.net', 'jtvnw.net'] },
  { id: 'pinterest', label: 'Pinterest', icon: '/icons/pinterest.svg', domains: ['pinterest.com', 'pinimg.com'] },
  { id: 'roblox', label: 'Roblox', icon: '/icons/roblox.svg', domains: ['roblox.com', 'rbxcdn.com', 'epicgames.com'] },
  { id: 'reddit', label: 'Reddit', icon: '/icons/reddit.svg', domains: ['reddit.com', 'redditmedia.com'] },
  { id: 'twitter', label: 'X', icon: '/icons/x.svg', domains: ['twitter.com', 'twimg.com', 'x.com'] }
];

export default function FiltersView({ profiles, hasUnsavedChanges, onUpdateProfileField, onSaveProfiles, savingProfiles }: FiltersViewProps) {
  const [activeProfileIdx, setActiveProfileIdx] = useState<number>(0);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const activeProfile = profiles[activeProfileIdx];

  const handleToggleApp = (appDomains: string[], forceState?: boolean) => {
    let currentLimits = activeProfile.limits || [];
    const isBlocked = appDomains.every(d => currentLimits.includes(d));

    if (forceState !== undefined) {
      if (forceState) {
        currentLimits = [...currentLimits, ...appDomains.filter(d => !currentLimits.includes(d))];
      } else {
        currentLimits = currentLimits.filter(d => !appDomains.includes(d));
      }
    } else {
      if (isBlocked) {
        currentLimits = currentLimits.filter(d => !appDomains.includes(d));
      } else {
        currentLimits = [...currentLimits, ...appDomains.filter(d => !currentLimits.includes(d))];
      }
    }
    
    onUpdateProfileField(activeProfileIdx, 'limits', currentLimits);
  };

  const handleToggleSingleDomain = (domain: string) => {
    let currentLimits = activeProfile.limits || [];
    if (currentLimits.includes(domain)) {
      currentLimits = currentLimits.filter(d => d !== domain);
    } else {
      currentLimits = [...currentLimits, domain];
    }
    onUpdateProfileField(activeProfileIdx, 'limits', currentLimits);
  };

  const getAppActiveCount = (appDomains: string[]) => {
    const limits = activeProfile?.limits || [];
    return appDomains.filter(d => limits.includes(d)).length;
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
    <>
      <div className="flex flex-col gap-6 animate-fade-in w-full pb-32">
        <div className="flex flex-col gap-2 border-b border-outline-variant pb-4">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">App Limits</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Block access to specific apps and websites. Limits only apply when a profile's Bedtime timer is active and set to 'App Limits' mode.</p>
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
                    {idx === 0 ? "Default" : (p.name || `Profile ${idx + 1}`)}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                  <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>
        </section>

        {activeProfile.start === -1 || activeProfile.end === -1 ? (
          <div className="bg-secondary-container text-on-secondary-container p-4 rounded-xl flex items-start gap-3 mb-section-margin">
            <span className="material-symbols-outlined shrink-0 text-primary">info</span>
            <div className="flex flex-col">
              <span className="font-label-md font-bold mb-1">Bedtime Disabled</span>
              <span className="font-body-md text-sm">
                App Limits only trigger during an active schedule. Please configure a clock for <b>{activeProfileIdx === 0 ? "Default" : (activeProfile.name || `Profile ${activeProfileIdx + 1}`)}</b> in the Profiles tab before these limits can be applied.
              </span>
            </div>
          </div>
        ) : null}

        <div className={`transition-opacity ${activeProfile.start === -1 || activeProfile.end === -1 ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Timer Mode Setting */}
          <section className="mb-section-margin">
            <div className="bg-secondary-container rounded-xl p-4">
              <p className="font-label-md text-label-md text-on-secondary-container mb-3 font-normal">When {activeProfile.name || 'this group'} hits its Bedtime schedule:</p>
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
          <div className="flex flex-col gap-3">
              {PREDEFINED_APPS.map((app: any) => {
                const isFullyBlocked = hasApp(app.domains);
                const activeCount = getAppActiveCount(app.domains);
                const isExpanded = expandedApp === app.id;

                return (
                  <div key={app.id} className={`w-full rounded-xl border transition-all ${
                    isExpanded ? 'shadow-md border-outline-variant bg-surface' : 'bg-surface border-outline-variant hover:bg-surface-container-high'
                  } ${!isExpanded && isFullyBlocked ? 'bg-[#FEE2E2] border-[#FECACA]' : ''}`}>
                    
                    {/* Header Row */}
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center`}>
                          <img src={app.icon} alt={app.label} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-body-lg text-body-lg ${
                            !isExpanded && isFullyBlocked ? 'text-[#991B1B]' : 'text-on-surface'
                          }`}>{app.label}</span>
                          <span className="font-label-sm text-outline">
                            {activeCount === app.domains.length ? "All domains blocked" : activeCount > 0 ? `${activeCount}/${app.domains.length} domains blocked` : "Allowed"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!isExpanded && (
                          <span className={`material-symbols-outlined ${
                            isFullyBlocked ? 'text-[#991B1B]' : 'text-outline-variant'
                          }`}>
                            {isFullyBlocked ? 'block' : 'check_circle'}
                          </span>
                        )}
                        <button 
                          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-variant transition-colors text-on-surface-variant"
                        >
                          <span className={`material-symbols-outlined transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            expand_more
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Drawer Content */}
                    {isExpanded && (
                      <div className="border-t border-outline-variant bg-surface-container-lowest rounded-b-xl overflow-hidden">
                        
                        {/* Master Toggle Header */}
                        <div className="flex items-center justify-between p-4 bg-surface-variant/30 border-b border-surface-variant">
                          <span className="font-label-md text-on-surface">Apply to all domains</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleToggleApp(app.domains, false); }}
                              className="px-3 py-1 font-label-md text-label-md rounded border border-outline-variant bg-surface hover:bg-surface-container-high transition-colors"
                            >Allow All</button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleToggleApp(app.domains, true); }}
                              className="px-3 py-1 font-label-md text-label-md rounded border border-transparent bg-error text-on-error hover:opacity-90 transition-colors"
                            >Block All</button>
                          </div>
                        </div>

                        {/* Individual Domains */}
                        <div className="flex flex-col">
                          {app.domains.map((domain: string) => {
                            const isDomainBlocked = (activeProfile.limits || []).includes(domain);
                            return (
                              <div key={domain} className="flex items-center justify-between py-5 px-4 md:px-6 hover:bg-surface-container-lowest/50 border-b border-surface-variant last:border-b-0">
                                <span className="font-label-md text-on-surface tracking-wide">{domain}</span>
                                
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleSingleDomain(domain); }}
                                  className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${
                                    isDomainBlocked ? 'bg-error' : 'bg-surface-variant'
                                  }`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                    isDomainBlocked ? 'left-7 font-bold' : 'left-1'
                                  }`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    )}

                  </div>
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
        </div>
      </div>
    </div>

      {hasUnsavedChanges && (
        <button 
          type="button"
          onClick={onSaveProfiles}
          disabled={savingProfiles}
          className="fixed right-6 z-50 bg-primary text-on-primary w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all bottom-24 md:bottom-8 disabled:opacity-50"
          title="Apply Limits"
        >
          {savingProfiles ? (
            <span className="material-symbols-outlined text-[28px] animate-spin">sync</span>
          ) : (
            <span className="material-symbols-outlined text-[28px]" style={{fontVariationSettings: "'FILL' 1"}}>save</span>
          )}
        </button>
      )}
    </>
  );
}