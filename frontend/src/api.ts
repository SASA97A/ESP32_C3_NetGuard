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
  return fetch(url, { ...options, headers });
}

export function uploadOTA(file: File, onProgress: (pct: number) => void): Promise<void> {
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
