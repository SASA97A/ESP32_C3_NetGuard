import { useState, useEffect } from 'react';
import ConnectView from './ConnectView';
import DashboardView from './DashboardView';
import SettingsView from './SettingsView';

function App() {
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('gateway');

  useEffect(() => {
    // If we have credentials, assume connected for now
    if (localStorage.getItem('router_ip') && localStorage.getItem('router_auth')) {
      setConnected(true);
    }
  }, []);

  if (!connected) {
    return <ConnectView onConnected={() => setConnected(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans sm:flex sm:justify-center">
      <div className="w-full sm:max-w-md bg-gray-100 min-h-screen relative pb-20 shadow-xl overflow-x-hidden">
        {/* Header */}
        <header className="bg-gray-100 pt-12 pb-4 px-4 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Access Gateway</h1>
          <button onClick={() => { localStorage.clear(); setConnected(false); }} className="text-sm font-semibold text-blue-500 active:opacity-70">Log Out</button>
        </header>

        <main className="px-4">
           {activeTab === 'gateway' ? <DashboardView /> : <SettingsView />}
        </main>

        {/* Tab Bar */}
        <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-8 z-50">
          <button onClick={() => setActiveTab('gateway')} className={`text-sm font-semibold flex flex-col items-center flex-1 ${activeTab==='gateway'?'text-blue-500':'text-gray-400'}`}>Gateway</button>
          <button onClick={() => setActiveTab('settings')} className={`text-sm font-semibold flex flex-col items-center flex-1 ${activeTab==='settings'?'text-blue-500':'text-gray-400'}`}>Settings</button>
        </div>
      </div>
    </div>
  );
}

export default App;
