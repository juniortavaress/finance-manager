import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { setToken } from '../../api/client';
import { authApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { IconMonitor, IconPhone } from '../icons';
import { useToast } from '../../context/ToastContext';
import { useFormError } from '../../hooks/useFormError';

const MIN_PASSWORD_LENGTH = 8;

function PasswordCard() {
  const { showSuccess, showError } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [, setError] = useFormError();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');

    setSaving(true);
    try {
      const data = await authApi.changePassword({ current_password: current, new_password: next });
      if (data?.token) setToken(data.token);
      showSuccess('Senha alterada com sucesso. Os outros dispositivos foram desconectados.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      const message = err.message || 'Não foi possível alterar a senha.';
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  const ready = current && next && confirm;

  return (
    <form className="set-card set-form" onSubmit={handleSubmit}>

      <div className="set-field">
        <div className="set-field-label">
          <label htmlFor="set-pw-current">Senha atual</label>
          <span>Para confirmar que é você.</span>
        </div>
        <input id="set-pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>

      <div className="set-field">
        <div className="set-field-label">
          <label htmlFor="set-pw-new">Nova senha</label>
          <span>Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</span>
        </div>
        <input id="set-pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>

      <div className="set-field">
        <div className="set-field-label">
          <label htmlFor="set-pw-confirm">Confirmar nova senha</label>
          <span>Digite a nova senha de novo.</span>
        </div>
        <input id="set-pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      <div className="set-form-actions">
        <button type="submit" className="set-btn set-btn-primary" disabled={!ready || saving}>
          {saving ? 'Salvando...' : 'Alterar senha'}
        </button>
      </div>
    </form>
  );
}

function formatLastUse(iso) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 2) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function SessionsCard() {
  const { showSuccess, showError } = useToast();
  const { data, loading, reload } = useFetch((signal) => authApi.sessions(signal), []);
  const [working, setWorking] = useState('');
  const sessions = data?.sessions || [];
  const others = sessions.filter((s) => !s.current).length;

  async function handleRevoke(id) {
    setWorking(id);
    try {
      await authApi.revokeSession(id);
      showSuccess('Dispositivo desconectado.');
      reload();
    } catch (err) {
      showError(err.message || 'Não foi possível desconectar o dispositivo.');
    } finally {
      setWorking('');
    }
  }

  async function handleLogoutAll() {
    setWorking('all');
    try {
      const result = await authApi.logoutAll();
      if (result?.token) setToken(result.token);
      showSuccess('Todos os outros dispositivos foram desconectados.');
      reload();
    } catch (err) {
      showError(err.message || 'Não foi possível encerrar as sessões.');
    } finally {
      setWorking('');
    }
  }

  return (
    <div className="set-card">
      {loading && sessions.length === 0 && <div className="set-empty">Carregando dispositivos...</div>}
      {!loading && sessions.length === 0 && <div className="set-empty">Nenhum dispositivo registrado.</div>}
      {sessions.map((s) => {
        const Icon = /iOS|Android/.test(s.device) ? IconPhone : IconMonitor;
        return (
          <div className="set-row" key={s.id}>
            <div className="set-row-main">
              <span className="set-device-icon">
                <Icon />
              </span>
              <div>
                <div className="set-row-title">
                  {s.device}
                  {s.current && <span className="set-pill set-pill-ok">Este dispositivo</span>}
                </div>
                <div className="set-row-sub">
                  {s.current ? 'Ativo agora' : `Último acesso ${formatLastUse(s.last_used_at)}`}
                  {s.ip_address ? ` · IP ${s.ip_address}` : ''}
                </div>
              </div>
            </div>
            {!s.current && (
              <button type="button" className="set-btn" onClick={() => handleRevoke(s.id)} disabled={!!working}>
                {working === s.id ? 'Encerrando...' : 'Desconectar'}
              </button>
            )}
          </div>
        );
      })}
      {others > 0 && (
        <div className="set-row">
          <div>
            <div className="set-row-title">Sair de todos os outros</div>
            <div className="set-row-sub">Desconecta todos os dispositivos acima, menos este.</div>
          </div>
          <button type="button" className="set-btn" onClick={handleLogoutAll} disabled={!!working}>
            {working === 'all' ? 'Encerrando...' : 'Desconectar todos'}
          </button>
        </div>
      )}
    </div>
  );
}

function DeleteAccountCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.preventDefault();
    setDeleting(true);
    try {
      await authApi.deleteAccount(password);
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      showError(err.message || 'Não foi possível excluir a conta.');
      setDeleting(false);
    }
  }

  return (
    <div className="set-card set-danger">
      <div className="set-row">
        <div>
          <div className="set-row-title">Excluir minha conta</div>
          <div className="set-row-sub">
            Você perde o acesso ao Atmos e não consegue mais entrar.
          </div>
        </div>
        {!open && (
          <button type="button" className="set-btn set-btn-danger" onClick={() => setOpen(true)}>
            Excluir conta
          </button>
        )}
      </div>
      {open && (
        <form className="set-danger-form" onSubmit={handleDelete}>
          <input
            type="password"
            placeholder="Sua senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="text"
            placeholder='Digite "EXCLUIR" para confirmar'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <div className="set-danger-actions">
            <button type="button" className="set-btn" onClick={() => setOpen(false)} disabled={deleting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="set-btn set-btn-danger"
              disabled={!password || confirmText.trim().toUpperCase() !== 'EXCLUIR' || deleting}
            >
              {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SecuritySection() {
  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Segurança</h2>
          <p>Proteja o acesso à sua conta.</p>
        </div>
      </div>

      <h3 className="set-subtitle">Senha</h3>
      <PasswordCard />

      <h3 className="set-subtitle">Sessões</h3>
      <SessionsCard />

      <h3 className="set-subtitle">Encerrar conta</h3>
      <DeleteAccountCard />
    </>
  );
}
