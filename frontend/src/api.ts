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
