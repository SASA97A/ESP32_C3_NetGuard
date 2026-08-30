import { useState } from 'react';

interface ConnectViewProps {
  onConnected: () => void;
}

export default function ConnectView({ onConnected }: ConnectViewProps) {
  const [ip, setIp] = useState('http://192.168.1.164');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // clean up URL if user typed just the IP
    let finalIp = ip.trim();
    if (!finalIp.startsWith('http')) finalIp = `http://${finalIp}`;
    
    const authHeader = 'Basic ' + btoa(`admin:${password}`);
    
    try {
      const res = await fetch(`${finalIp}/stats.json`, {
        headers: {
          'Authorization': authHeader
        }
      });
      if (res.status === 401) {
        setError('Invalid Password');
      } else if (res.ok) {
        localStorage.setItem('router_ip', finalIp);
        localStorage.setItem('router_auth', authHeader);
        onConnected();
      } else {
        setError('Connection failed. Status: ' + res.status);
      }
    } catch (err) {
      setError('Cannot reach device. Ensure you are on the same WiFi network and input is correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Connect to Gateway
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleConnect}>
            <div>
              <label htmlFor="ip" className="block text-sm font-medium text-gray-700">Gateway IP Address</label>
              <div className="mt-1">
                <input id="ip" name="ip" type="text" required value={ip} onChange={e => setIp(e.target.value)}
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Dashboard Password</label>
              <div className="mt-1">
                <input id="password" name="password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm" />
              </div>
            </div>

            {error && <div className="text-red-600 text-sm">{error}</div>}

            <div>
              <button type="submit" disabled={loading}
                className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300">
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
