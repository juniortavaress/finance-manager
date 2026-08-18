import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { CURRENCY_OPTIONS } from '../../utils/currency';
import ModalShell from './ModalShell';

export default function EditProfileModal({ open, onClose }) {
  const { user, updateUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [currencyDefault, setCurrencyDefault] = useState('BRL');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(user?.name || '');
    setCurrencyDefault(user?.currency_default || 'BRL');
    setError('');
  }, [open, user]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe seu nome.');

    setSubmitting(true);
    try {
      await updateUser({ name: name.trim(), currency_default: currencyDefault });
      showSuccess('Perfil atualizado com sucesso.');
      onClose();
    } catch (err) {
      const message = err.message || 'Não foi possível atualizar o perfil.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Editar perfil</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label>E-mail</label>
            <input type="text" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
          </div>

          <div className="field">
            <label>Moeda padrão</label>
            <select value={currencyDefault} onChange={(e) => setCurrencyDefault(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 4 }}>
              Troca apenas o símbolo padrão de exibição, sem converter nenhum valor. Contas com moeda própria
              continuam mostrando seu próprio símbolo.
            </div>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
