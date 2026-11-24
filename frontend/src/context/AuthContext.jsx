import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken } from '../api/client';
import { authApi } from '../api/resources';
import { setDefaultCurrency } from '../state/currentUserCurrency';
import { clearFetchCache } from '../hooks/useFetch';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function applyUser(u) {
    setUser(u);
    setDefaultCurrency(u?.currency_default);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((data) => {
        if (data.token) setToken(data.token);
        applyUser(data.user);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    clearFetchCache();
    setToken(data.token);
    applyUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    const data = await authApi.register({ name, email, password });
    clearFetchCache();
    setToken(data.token);
    applyUser(data.user);
    return data.user;
  }, []);

  const updateUser = useCallback(async (patch) => {
    const data = await authApi.updateMe(patch);
    applyUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    // Avisa o servidor para encerrar esta sessao; se falhar, o logout local segue igual.
    authApi.logout().catch(() => {});
    clearFetchCache();
    setToken(null);
    setUser(null);
    setDefaultCurrency('BRL');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
