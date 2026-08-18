const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'cofre_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, params, signal } = {}) {
  let url = `${API_URL}${path}`;
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (query) url += `?${query}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
    }
    throw new ApiError(data?.error || 'Erro inesperado na requisicao', res.status);
  }

  return data;
}

export const api = {
  get: (path, params, signal) => request(path, { method: 'GET', params, signal }),
  post: (path, body, signal) => request(path, { method: 'POST', body, signal }),
  patch: (path, body, signal) => request(path, { method: 'PATCH', body, signal }),
  delete: (path, body, signal) => request(path, { method: 'DELETE', body, signal }),
};

export { ApiError };
