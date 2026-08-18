import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { IconPencil } from '../components/icons';
import EditProfileModal from '../components/modals/EditProfileModal';

export default function Settings() {
  const { user } = useAuth();
  const { banks, accounts } = useData();
  const [editModalOpen, setEditModalOpen] = useState(false);

  const cardAccounts = accounts.filter((a) => a.type === 'credit_card');

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Configurações</h1>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>
            Perfil
            <button
              type="button"
              title="Editar perfil"
              onClick={() => setEditModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 7,
                border: 'none',
                background: 'transparent',
                color: 'var(--ink-faint)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg)';
                e.currentTarget.style.color = 'var(--teal)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--ink-faint)';
              }}
            >
              <IconPencil style={{ width: 13, height: 13 }} />
            </button>
          </h3>
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

      <EditProfileModal open={editModalOpen} onClose={() => setEditModalOpen(false)} />
    </div>
  );
}
