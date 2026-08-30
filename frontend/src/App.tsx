import { useState, useEffect } from 'react';
import ConnectView from './ConnectView';
import DashboardView from './DashboardView';
import SettingsView from './SettingsView';

function App() {
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    // If we have credentials, assume connected for now
    if (localStorage.getItem('router_ip') && localStorage.getItem('router_auth')) {
      setConnected(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setConnected(false);
  };

  if (!connected) {
    return <ConnectView onConnected={() => setConnected(true)} />;
  }

  return (
    <div className="bg-background text-on-background min-h-screen pb-24 font-body-md pt-14">
      {/* TopAppBar Header */}
      <header className="fixed top-0 w-full z-50 bg-surface dark:bg-on-background border-b border-outline-variant dark:border-outline flat no shadows h-14">
        <div className="flex justify-between items-center px-container-padding h-full w-full">
          <div className="flex items-center gap-inline-gap">
            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim" data-icon="shield">shield</span>
            <h1 className="font-headline-md text-headline-md font-bold text-primary dark:text-primary-fixed-dim">NetGuard Admin</h1>
          </div>
          <button
            onClick={handleLogout}
            className="font-label-md text-label-md text-primary dark:text-primary-fixed-dim active:opacity-80 transition-opacity hover:bg-surface-container-high px-2 py-1 rounded"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <aside className="hidden md:flex fixed left-0 top-14 bottom-0 w-64 bg-surface border-r border-outline-variant flex-col p-4 gap-2">
        <button
          onClick={() => setActiveTab('home')}
          className={activeTab === 'home'
            ? "flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
            : "flex items-center gap-3 text-on-surface-variant rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
          }
        >
          <span className="material-symbols-outlined" data-icon="home" style={activeTab === 'home' ? { fontVariationSettings: "'FILL' 1" } : undefined}>home</span>
          <span className="font-label-md text-label-md">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={activeTab === 'groups' || activeTab === 'profiles'
            ? "flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
            : "flex items-center gap-3 text-on-surface-variant rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
          }
        >
          <span className="material-symbols-outlined" data-icon="groups" style={activeTab === 'groups' || activeTab === 'profiles' ? { fontVariationSettings: "'FILL' 1" } : undefined}>groups</span>
          <span className="font-label-md text-label-md">Profiles</span>
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          className={activeTab === 'devices' || activeTab === 'clients'
            ? "flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
            : "flex items-center gap-3 text-on-surface-variant rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
          }
        >
          <span className="material-symbols-outlined" data-icon="devices" style={activeTab === 'devices' || activeTab === 'clients' ? { fontVariationSettings: "'FILL' 1" } : undefined}>devices</span>
          <span className="font-label-md text-label-md">Clients</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={activeTab === 'settings'
            ? "flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
            : "flex items-center gap-3 text-on-surface-variant rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left"
          }
        >
          <span className="material-symbols-outlined" data-icon="settings" style={activeTab === 'settings' ? { fontVariationSettings: "'FILL' 1" } : undefined}>settings</span>
          <span className="font-label-md text-label-md">Settings</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="md:pl-64 transition-all">
        {activeTab === 'settings' ? (
          <SettingsView />
        ) : (
          <DashboardView />
        )}
      </main>

      {/* BottomNavBar (Mobile only) */}
      <nav className="fixed bottom-0 w-full z-50 h-16 bg-surface dark:bg-on-background border-t border-outline-variant dark:border-outline flat no shadows md:hidden">
        <div className="flex justify-around items-center w-full px-container-padding pb-safe h-full">
          <button
            onClick={() => setActiveTab('home')}
            className={activeTab === 'home'
              ? "flex flex-col items-center justify-center bg-secondary-container dark:bg-secondary-fixed-dim text-on-secondary-container dark:text-on-secondary-fixed-variant rounded-full px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
              : "flex flex-col items-center justify-center text-on-surface-variant dark:text-on-surface-variant px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
            }
          >
            <span className="material-symbols-outlined" data-icon="home" style={activeTab === 'home' ? { fontVariationSettings: "'FILL' 1" } : undefined}>home</span>
            <span className="font-label-sm text-label-sm mt-1">Home</span>
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={activeTab === 'groups' || activeTab === 'profiles'
              ? "flex flex-col items-center justify-center bg-secondary-container dark:bg-secondary-fixed-dim text-on-secondary-container dark:text-on-secondary-fixed-variant rounded-full px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
              : "flex flex-col items-center justify-center text-on-surface-variant dark:text-on-surface-variant px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
            }
          >
            <span className="material-symbols-outlined" data-icon="groups" style={activeTab === 'groups' || activeTab === 'profiles' ? { fontVariationSettings: "'FILL' 1" } : undefined}>groups</span>
            <span className="font-label-sm text-label-sm mt-1">Profiles</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={activeTab === 'devices' || activeTab === 'clients'
              ? "flex flex-col items-center justify-center bg-secondary-container dark:bg-secondary-fixed-dim text-on-secondary-container dark:text-on-secondary-fixed-variant rounded-full px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
              : "flex flex-col items-center justify-center text-on-surface-variant dark:text-on-surface-variant px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
            }
          >
            <span className="material-symbols-outlined" data-icon="devices" style={activeTab === 'devices' || activeTab === 'clients' ? { fontVariationSettings: "'FILL' 1" } : undefined}>devices</span>
            <span className="font-label-sm text-label-sm mt-1">Clients</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={activeTab === 'settings'
              ? "flex flex-col items-center justify-center bg-secondary-container dark:bg-secondary-fixed-dim text-on-secondary-container dark:text-on-secondary-fixed-variant rounded-full px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
              : "flex flex-col items-center justify-center text-on-surface-variant dark:text-on-surface-variant px-5 py-1 hover:bg-surface-container-low active:scale-95 transition-transform"
            }
          >
            <span className="material-symbols-outlined" data-icon="settings" style={activeTab === 'settings' ? { fontVariationSettings: "'FILL' 1" } : undefined}>settings</span>
            <span className="font-label-sm text-label-sm mt-1">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
