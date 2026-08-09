import { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { IconEye, IconEyeOff } from '../components/icons';

const REMEMBERED_EMAIL_KEY = 'cofre_remembered_email';

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      navigate('/', { replace: true });
    } catch (err) {
      const message = err.message || 'Nao foi possivel entrar';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <svg className="logo" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="38" height="38" rx="10" fill="#0F5C5C" />
            <circle cx="20" cy="20" r="11.5" stroke="#EEF2F0" strokeWidth="2" />
            <circle cx="20" cy="20" r="2.6" fill="#C0912F" />
            <line x1="20" y1="20" x2="20" y2="11.3" stroke="#EEF2F0" strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="20" x2="26" y2="23.2" stroke="#C0912F" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            <div className="wordmark">Atmos</div>
            <span className="sub">gestão financeira</span>
          </div>
        </div>

        <div className="login-title">Entrar</div>
        <div className="login-subtitle">Acesse sua conta para continuar</div>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>

          <label className="remember-me-row">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Lembrar meu email
          </label>

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-hint">
          Não tem conta? <Link to="/register">Criar conta</Link>
          <br />
          <br />
          Usuário de demonstração
          <br />
          <b>junior@gmail.com</b> · senha <b>123456</b>
        </div>
      </div>
    </div>
  );
}
