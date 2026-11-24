import { useState } from 'react';
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
    </>
  );
}
