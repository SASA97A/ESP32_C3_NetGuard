import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import ConnectView from './ConnectView';
import DashboardView from './DashboardView';
import SettingsView from './SettingsView';

function SidebarNav() {
  const loc = useLocation();
  const act = loc.pathname;
  
  const getNavClass = (isActive: boolean) => 
    `w-full flex items-center gap-3 rounded-lg px-4 py-3 active:scale-95 transition-all text-left ${
      isActive 
        ? 'bg-primary text-on-primary hover:opacity-90 shadow-sm' 
        : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
    }`;

  return (
    <aside className="hidden md:flex fixed left-0 top-14 bottom-0 w-64 bg-surface border-r border-outline-variant flex-col p-4 gap-2">
      <Link
        to="/home"
        className={getNavClass(act === '/home')}
      >
        <span className="material-symbols-outlined" data-icon="home" style={act === '/home' ? { fontVariationSettings: "'FILL' 1" } : undefined}>home</span>
        <span className="font-label-md text-label-md">Home</span>
      </Link>
      <Link
        to="/profiles"
        className={getNavClass(act === '/profiles')}
      >
        <span className="material-symbols-outlined" data-icon="tune" style={act === '/profiles' ? { fontVariationSettings: "'FILL' 1" } : undefined}>tune</span>
        <span className="font-label-md text-label-md">Profiles</span>
      </Link>
      <Link
        to="/filters"
        className={getNavClass(act === '/filters')}
      >
        <span className="material-symbols-outlined" data-icon="filter_alt" style={act === '/filters' ? { fontVariationSettings: "'FILL' 1" } : undefined}>filter_alt</span>
        <span className="font-label-md text-label-md">App Limits</span>
      </Link>
      <Link
        to="/clients"
        className={getNavClass(act === '/clients')}
      >
        <span className="material-symbols-outlined" data-icon="devices" style={act === '/clients' ? { fontVariationSettings: "'FILL' 1" } : undefined}>devices</span>
        <span className="font-label-md text-label-md">Clients</span>
      </Link>
      <Link
        to="/settings"
        className={getNavClass(act === '/settings')}
      >
        <span className="material-symbols-outlined" data-icon="settings" style={act === '/settings' ? { fontVariationSettings: "'FILL' 1" } : undefined}>settings</span>
        <span className="font-label-md text-label-md">Settings</span>
      </Link>
    </aside>
  );
}

function BottomNav() {
  const loc = useLocation();
  const act = loc.pathname;
  return (
    <nav className="fixed bottom-0 w-full z-10 bg-surface dark:bg-on-background border-t border-outline-variant flex justify-around items-center h-16 pb-safe md:hidden px-2 overflow-x-auto">
      <Link to="/home" className={`flex-1 min-w-[64px] mx-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-transform active:scale-95 ${act === '/home' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined">home</span>
        <span className="font-label-md text-[10px] mt-1">Home</span>
      </Link>
      <Link to="/profiles" className={`flex-1 min-w-[64px] mx-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-transform active:scale-95 ${act === '/profiles' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined">tune</span>
        <span className="font-label-md text-[10px] mt-1">Profiles</span>
      </Link>
      <Link to="/filters" className={`flex-1 min-w-[64px] mx-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-transform active:scale-95 ${act === '/filters' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined">filter_alt</span>
        <span className="font-label-md text-[10px] mt-1">Limits</span>
      </Link>
      <Link to="/clients" className={`flex-1 min-w-[64px] mx-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-transform active:scale-95 ${act === '/clients' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined">devices</span>
        <span className="font-label-md text-[10px] mt-1">Clients</span>
      </Link>
      <Link to="/settings" className={`flex-1 min-w-[64px] mx-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-transform active:scale-95 ${act === '/settings' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined">settings</span>
        <span className="font-label-md text-[10px] mt-1">Settings</span>
      </Link>
    </nav>
  );
}

function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!sessionStorage.getItem('pwaPromptSkipped')) {
        setShowPrompt(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!showPrompt) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwaPromptSkipped', 'true');
    setShowPrompt(false);
  };

  return (
    <div className="fixed bottom-20 md:bottom-8 left-4 right-4 md:left-auto md:right-8 z-[100] bg-surface border border-outline-variant shadow-lg rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 animate-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="bg-primary text-on-primary w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">shield</span>
        </div>
        <div className="flex flex-col">
          <span className="font-headline-md text-label-md font-bold text-on-surface">Install NetGuard</span>
          <span className="font-body-md text-[12px] text-on-surface-variant leading-tight">Add to your home screen for quick access.</span>
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0 justify-end">
        <button 
          onClick={handleDismiss}
          className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors font-label-md text-label-md"
        >
          No
        </button>
        <button 
          onClick={handleInstall}
          className="px-4 py-1.5 rounded-lg bg-primary text-on-primary hover:opacity-90 active:scale-95 transition-all font-label-md text-label-md whitespace-nowrap"
        >
          Yes
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const [connected, setConnected] = useState(false);

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
            <h1 className="font-headline-md text-headline-md font-bold text-primary dark:text-primary-fixed-dim">NetGuard</h1>
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
      <SidebarNav />

      {/* Main Content */}
      <main className="md:pl-64 transition-all">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<DashboardView tab="home" />} />
          <Route path="/profiles" element={<DashboardView tab="profiles" />} />
          <Route path="/filters" element={<DashboardView tab="filters" />} />
          <Route path="/clients" element={<DashboardView tab="clients" />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      {/* PWA Install Banner */}
      <PwaInstallPrompt />

      {/* BottomNavBar (Mobile only) */}
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
