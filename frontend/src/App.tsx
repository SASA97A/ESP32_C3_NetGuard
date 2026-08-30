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
    <div className="min-h-screen bg-gray-100 pb-16 sm:pb-0">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">ESP32 Parental Controls</h1>
          <button
            onClick={() => {
              localStorage.clear();
              setConnected(false);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Disconnect
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'gateway' ? <DashboardView /> : <SettingsView />}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-7xl mx-auto bg-gray-50 border-t border-gray-200 flex justify-around p-3 pb-safe z-50">
        <button onClick={() => setActiveTab('gateway')} className={`flex flex-col items-center ${activeTab==='gateway'?'text-blue-500':'text-gray-500'}`}>Gateway</button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center ${activeTab==='settings'?'text-blue-500':'text-gray-500'}`}>Settings</button>
      </div>
    </div>
  );
}

export default App;
