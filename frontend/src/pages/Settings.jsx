import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { CURRENCY_OPTIONS } from '../utils/currency';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { banks, accounts } = useData();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [currencyDefault, setCurrencyDefault] = useState('BRL');
  const [submitting, setSubmitting] = useState(false);

  const cardAccounts = accounts.filter((a) => a.type === 'credit_card');

  useEffect(() => {
    setName(user?.name || '');
    setCurrencyDefault(user?.currency_default || 'BRL');
  }, [user]);

  const hasChanges = name.trim() !== (user?.name || '') || currencyDefault !== (user?.currency_default || 'BRL');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      showError('Informe seu nome.');
      return;
    }
    setSubmitting(true);
    try {
      await updateUser({ name: name.trim(), currency_default: currencyDefault });
      showSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      showError(err.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Configurações</h1>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>Perfil</h3>
          <form onSubmit={handleSubmit}>
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
            <div className="modal-actions" style={{ paddingTop: 4 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting || !hasChanges}>
                {submitting ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
        <div className="card">
          <h3>Bancos e contas</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
            {banks.length} banco(s) cadastrado(s), {cardAccounts.length} cartão(ões) de crédito.
          </p>
          {banks.map((b) => (
            <div className="bank-row" key={b.id}>
              <div className="bank-id">
                <span className="bank-chip" style={{ background: b.color_hex }} />
                <div className="bank-name">{b.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
