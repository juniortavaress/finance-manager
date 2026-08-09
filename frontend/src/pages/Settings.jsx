import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

export default function Settings() {
  const { user } = useAuth();
  const { banks, accounts } = useData();

  const cardAccounts = accounts.filter((a) => a.type === 'credit_card');

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Configurações</h1>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>Perfil</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>
            <b style={{ color: 'var(--ink)' }}>{user?.name}</b>
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{user?.email}</p>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 10 }}>
            Moeda padrão: {user?.currency_default}
          </p>
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
