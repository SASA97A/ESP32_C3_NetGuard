import { useState } from 'react';
import { universalFetch, isTauri } from './api';

interface ConnectViewProps {
  onConnected: () => void;
}

export default function ConnectView({ onConnected }: ConnectViewProps) {
  const [ip, setIp] = useState('');
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
      const res = await universalFetch(`${finalIp}/stats.json`, {
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
      if (window.location.protocol === 'https:' && !isTauri()) {
        setError('Connection blocked by browser security (HTTPS). Modern web browsers refuse to connect to local devices from an HTTPS website. Please download our Desktop App from GitHub Releases to manage your router securely.');
      } else {
        setError('Cannot reach device. Ensure you are on the same WiFi network and input is correct.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-body-md text-body-md">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-surface border-b border-outline-variant flex justify-between items-center px-container-padding h-14 w-full">
        <div className="flex items-center gap-inline-gap">
          <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
          <h1 className="font-headline-md text-headline-md font-bold text-primary">NetGuard</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center pt-14 p-container-padding">
        {/* Login Card */}
        <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-lg p-section-margin shadow-sm transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
          <div className="text-center mb-stack-gap pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-container text-on-primary-container mb-stack-gap">
              <span className="material-symbols-outlined text-[24px]">router</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Connect to Gateway</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Enter your credentials to manage network security.</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8" id="loading-state">
              <span className="material-symbols-outlined animate-spin text-primary text-[32px] mb-4">sync</span>
              <p className="font-body-md text-body-md text-on-surface-variant">Establishing secure connection...</p>
            </div>
          ) : (
            <form className="flex flex-col gap-stack-gap" onSubmit={handleConnect}>
              {/* Gateway IP */}
              <div className="flex flex-col gap-base">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="gateway-ip">Gateway IP</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-outline">
                    <span className="material-symbols-outlined text-[18px]">dns</span>
                  </span>
                  <input
                    className="w-full pl-10 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-label-md text-label-md text-on-surface transition-colors"
                    id="gateway-ip"
                    name="gateway-ip"
                    placeholder="e.g. c3netguard.local or 192.168.x.x"
                    type="text"
                    value={ip}
                    onChange={e => setIp(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-base">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="password">Dashboard Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-outline">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                  </span>
                  <input
                    className="w-full pl-10 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md text-on-surface transition-colors"
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-error-container text-on-error-container rounded-DEFAULT border border-error/20 text-error mt-2">
                  <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
                  <p className="font-body-md text-body-md text-sm text-error">{error}</p>
                </div>
              )}

              <div className="pt-2">
                <button
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-on-primary font-body-md font-semibold rounded-DEFAULT flex items-center justify-center gap-base transition-colors"
                  id="connect-btn"
                  type="submit"
                  disabled={loading}
                >
                  <span>Connect</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
