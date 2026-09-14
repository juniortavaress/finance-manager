import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { investmentsApi } from '../api/resources';
import LoadingScreen from './LoadingScreen';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  // Dispara em background a atualizacao do cache de cotacoes/precos externos
  // (cripto, CDI/Selic, cambio) assim que a sessao autenticada existe, mesmo
  // antes do usuario abrir a Carteira - quando ele chegar la, os endpoints de
  // investimentos ja encontram o cache quente e respondem na hora.
  // Fire-and-forget: nao bloqueia navegacao nem trata erro.
  useEffect(() => {
    if (isAuthenticated) investmentsApi.refreshMarketData().catch(() => {});
  }, [isAuthenticated]);

  if (loading) {
    return <LoadingScreen />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
