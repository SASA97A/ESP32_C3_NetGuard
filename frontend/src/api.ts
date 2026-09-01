import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// Helper to check if we are in Tauri Environment
declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, unknown>;
  }
}

export const isTauri = () => {
  return window !== undefined && window.__TAURI_INTERNALS__ !== undefined;
};

// Unified fetch to bypass Mixed Content in Desktop App but work normally on Web
export async function universalFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isTauri()) {
    try {
      // Use Tauri's native Rust HTTP client
      return await tauriFetch(url, options);
    } catch (e) {
      console.warn("Tauri fetch failed, falling back to window fetch", e);
      return window.fetch(url, options);
    }
  }
  return window.fetch(url, options);
}

export function getApiBaseUrl() {
  return localStorage.getItem('router_ip') || '';
}

export function getAuthHeader() {
  return localStorage.getItem('router_auth') || '';
}

export function getSessionToken() {
  return localStorage.getItem('router_session_token') || '';
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  let finalEndpoint = endpoint;
  if (options.method === 'POST' && !endpoint.includes('token=')) {
    const sym = endpoint.includes('?') ? '&' : '?';
    finalEndpoint = `${endpoint}${sym}token=${getSessionToken()}`;
  }
  const url = `${getApiBaseUrl()}${finalEndpoint}`;
  const headers = {
    ...options.headers,
    'Authorization': getAuthHeader(),
  };
  return universalFetch(url, { ...options, headers });
}

export function uploadOTA(file: File, onProgress: (pct: number) => void): Promise<void> {
  if (isTauri()) {
    return new Promise(async (resolve, reject) => {
      onProgress(10);
      const endpoint = `/update?token=${getSessionToken()}`;
      const url = `${getApiBaseUrl()}${endpoint}`;
      
      const formData = new FormData();
      formData.append('update', file);
      
      onProgress(50);
      try {
        const res = await tauriFetch(url, {
          method: 'POST',
          headers: {
            'Authorization': getAuthHeader()
          },
          body: formData
        });
        
        if (res.ok) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`Status ${res.status}: await res.text()`));
        }
      } catch (err) {
        reject(new Error('Network error during upload'));
      }
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const endpoint = `/update?token=${getSessionToken()}`;
    const url = `${getApiBaseUrl()}${endpoint}`;

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', getAuthHeader());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) resolve();
      else reject(new Error(`Status ${xhr.status}: ${xhr.responseText}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const formData = new FormData();
    formData.append('update', file);
    xhr.send(formData);
  });
}
