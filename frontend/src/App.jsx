import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoadingScreen from './components/LoadingScreen';
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const BankDetail = lazy(() => import('./pages/BankDetail'));
const Transactions = lazy(() => import('./pages/Transactions'));
const RecurringTransactions = lazy(() => import('./pages/RecurringTransactions'));
const Installments = lazy(() => import('./pages/Installments'));
const Investments = lazy(() => import('./pages/Investments'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const AssetTrades = lazy(() => import('./pages/AssetTrades'));
const Dividends = lazy(() => import('./pages/Dividends'));
const Reports = lazy(() => import('./pages/Reports'));
const Quotes = lazy(() => import('./pages/Quotes'));
const Settings = lazy(() => import('./pages/Settings'));
const Friends = lazy(() => import('./pages/Friends'));
const FriendsList = lazy(() => import('./pages/FriendsList'));
const FriendDetail = lazy(() => import('./pages/FriendDetail'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="contas" element={<Accounts />} />
              <Route path="contas/:bankId" element={<BankDetail />} />
              <Route path="transacoes" element={<Transactions />} />
              <Route path="recorrentes" element={<RecurringTransactions />} />
              <Route path="parcelas" element={<Installments />} />
              <Route path="lembretes" element={<Navigate to="/recorrentes" replace />} />
              <Route path="categorias" element={<Navigate to="/configuracoes?secao=categorias" replace />} />
              <Route path="amigos" element={<Friends />} />
              <Route path="amigos/lista" element={<FriendsList />} />
              <Route path="amigos/grupos" element={<Groups />} />
              <Route path="amigos/grupos/:groupId" element={<GroupDetail />} />
              <Route path="amigos/:friendUserId" element={<FriendDetail />} />
              <Route path="investimentos" element={<Investments />} />
              <Route path="investimentos/carteira" element={<Portfolio />} />
              <Route path="investimentos/compras-vendas" element={<AssetTrades />} />
              <Route path="investimentos/dividendos" element={<Dividends />} />
              <Route path="relatorios" element={<Reports />} />
              <Route path="cotacoes" element={<Quotes />} />
              <Route path="configuracoes" element={<Settings />} />
            </Route>
          </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
