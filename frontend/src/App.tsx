import { useState, useEffect } from 'react';
import ConnectView from './ConnectView';

function App() {
  const [connected, setConnected] = useState(false);

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
    <div>
       <button onClick={() => {
         localStorage.clear();
         setConnected(false);
       }}>Disconnect</button>
       {/* Dashboard placeholder */}
       <p>Dashboard</p>
    </div>
  );
}

export default App;
