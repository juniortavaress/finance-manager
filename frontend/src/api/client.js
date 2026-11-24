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

// Baixa um arquivo autenticado (o token vai no header, entao nao da para usar um link simples).
export async function downloadFile(path, params) {
  let url = `${API_URL}${path}`;
  if (params) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    if (query) url += `?${query}`;
  }
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0);
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new ApiError(data?.error || 'Não foi possível gerar o arquivo.', res.status);
  }
  const filename = /filename="?([^"]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'meus-dados-financeiros.xlsx';
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export const api = {
  get: (path, params, signal) => request(path, { method: 'GET', params, signal }),
  post: (path, body, signal) => request(path, { method: 'POST', body, signal }),
  patch: (path, body, signal) => request(path, { method: 'PATCH', body, signal }),
  delete: (path, body, signal) => request(path, { method: 'DELETE', body, signal }),
};

export { ApiError };
