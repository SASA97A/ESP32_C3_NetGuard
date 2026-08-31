import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import ConnectView from './ConnectView';
import DashboardView from './DashboardView';
import SettingsView from './SettingsView';

function SidebarNav() {
  const loc = useLocation();
  const act = loc.pathname;
  return (
    <aside className="hidden md:flex fixed left-0 top-14 bottom-0 w-64 bg-surface border-r border-outline-variant flex-col p-4 gap-2">
      <Link
        to="/home"
        className={`flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left ${
          act === '/home' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="home" style={act === '/home' ? { fontVariationSettings: "'FILL' 1" } : undefined}>home</span>
        <span className="font-label-md text-label-md">Home</span>
      </Link>
      <Link
        to="/profiles"
        className={`flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left ${
          act === '/profiles' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="tune" style={act === '/profiles' ? { fontVariationSettings: "'FILL' 1" } : undefined}>tune</span>
        <span className="font-label-md text-label-md">Profiles</span>
      </Link>
      <Link
        to="/clients"
        className={`flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left ${
          act === '/clients' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="devices" style={act === '/clients' ? { fontVariationSettings: "'FILL' 1" } : undefined}>devices</span>
        <span className="font-label-md text-label-md">Clients</span>
      </Link>
      <Link
        to="/settings"
        className={`flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-surface-container-low active:scale-95 transition-transform text-left ${
          act === '/settings' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'
        }`}
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
    <nav className="fixed bottom-0 w-full z-10 bg-surface dark:bg-on-background border-t border-outline-variant flex justify-around items-center h-16 pb-safe md:hidden">
      <Link to="/home" className={`flex flex-col items-center justify-center p-2 rounded-xl transition-transform active:scale-95 ${act === '/home' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined font-label-md">home</span>
        <span className="font-label-md text-[10px] mt-1">Home</span>
      </Link>
      <Link to="/profiles" className={`flex flex-col items-center justify-center p-2 rounded-xl transition-transform active:scale-95 ${act === '/profiles' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined font-label-md">tune</span>
        <span className="font-label-md text-[10px] mt-1">Profiles</span>
      </Link>
      <Link to="/clients" className={`flex flex-col items-center justify-center p-2 rounded-xl transition-transform active:scale-95 ${act === '/clients' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined font-label-md">devices</span>
        <span className="font-label-md text-[10px] mt-1">Clients</span>
      </Link>
      <Link to="/settings" className={`flex flex-col items-center justify-center p-2 rounded-xl transition-transform active:scale-95 ${act === '/settings' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}>
        <span className="material-symbols-outlined font-label-md">settings</span>
        <span className="font-label-md text-[10px] mt-1">Settings</span>
      </Link>
    </nav>
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
      <SidebarNav />

      {/* Main Content */}
      <main className="md:pl-64 transition-all">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<DashboardView tab="home" />} />
          <Route path="/profiles" element={<DashboardView tab="profiles" />} />
          <Route path="/clients" element={<DashboardView tab="clients" />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>

      {/* BottomNavBar (Mobile only) */}
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
