export function getApiBaseUrl() {
  return localStorage.getItem('router_ip') || '';
}

export function getAuthHeader() {
  return localStorage.getItem('router_auth') || '';
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${getApiBaseUrl()}${endpoint}`;
  const headers = {
    ...options.headers,
    'Authorization': getAuthHeader(),
  };
  return fetch(url, { ...options, headers });
}
