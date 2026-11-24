import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';

const MIN_PASSWORD_LENGTH = 8;

function PasswordCard() {
  const { showSuccess, showError } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');

    setSaving(true);
    try {
      await authApi.changePassword({ current_password: current, new_password: next });
      showSuccess('Senha alterada com sucesso.');
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
      {error && <div className="form-error-banner">{error}</div>}

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
            Você perde o acesso ao Atmos e não consegue mais entrar. Essa ação não pode ser desfeita por aqui.
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

      <h3 className="set-subtitle">Zona de perigo</h3>
      <DeleteAccountCard />
    </>
  );
}
