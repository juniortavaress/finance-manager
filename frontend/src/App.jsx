import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import DataBootstrap from './components/DataBootstrap';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import RecurringTransactions from './pages/RecurringTransactions';
import Installments from './pages/Installments';
import Categories from './pages/Categories';
import Investments from './pages/Investments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DataProvider>
                    <DataBootstrap>
                      <AppLayout />
                    </DataBootstrap>
                  </DataProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="contas" element={<Accounts />} />
              <Route path="transacoes" element={<Transactions />} />
              <Route path="recorrentes" element={<RecurringTransactions />} />
              <Route path="parcelas" element={<Installments />} />
              <Route path="lembretes" element={<Navigate to="/recorrentes" replace />} />
              <Route path="categorias" element={<Categories />} />
              <Route path="investimentos" element={<Investments />} />
              <Route path="relatorios" element={<Reports />} />
              <Route path="configuracoes" element={<Settings />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
