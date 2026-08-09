import { useState } from 'react';
import { useData } from '../context/DataContext';
import { recurringApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { fmt } from '../utils/format';
import { IconPencil } from '../components/icons';
import RecurringModal from '../components/modals/RecurringModal';

export default function RecurringTransactions() {
  const { categoryById, accountById } = useData();
  const { showSuccess, showError } = useToast();
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);

  const { data: recurringData, reload: reloadRecurring } = useFetch(() => recurringApi.list(), []);
  const recurringList = recurringData?.recurring_transactions || [];
  const activeRecurring = recurringList.filter((r) => r.active);
  const totalCommitted = activeRecurring.reduce((s, r) => s + r.amount, 0);

  async function toggleRecurring(recurring) {
    try {
      await recurringApi.update(recurring.id, { active: !recurring.active });
      showSuccess(recurring.active ? 'Recorrente pausado.' : 'Recorrente ativado.');
      reloadRecurring();
    } catch (err) {
      showError(err.message || 'Não foi possível atualizar o recorrente.');
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Recorrentes</h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={() => setAutoModalOpen(true)}
        >
          + recorrente
        </div>
      </div>

      <div className="card stat-card" style={{ '--stripe': '#C0912F', marginBottom: 16 }}>
        <div className="label">Total comprometido por mês</div>
        <div className="value num">{fmt(totalCommitted)}</div>
        <div className="delta">{activeRecurring.length} recorrentes ativos</div>
      </div>
      <div className="card">
        <h3>Recorrentes cadastrados</h3>
        {recurringList.length === 0 && <div className="empty-state">Nenhum recorrente cadastrado.</div>}
        {recurringList.map((r) => {
          const category = categoryById(r.category_id) || r.category;
          const account = accountById(r.account_id) || r.account;
          const isCredit = r.payment_method === 'credit';
          return (
            <div className="auto-row" key={r.id}>
              <div className="auto-left">
                <div className="auto-icon" style={{ background: `${category?.color_hex || '#8B9A97'}22` }}>
                  {category?.icon || '📁'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div className="auto-desc">{r.description}</div>
                    <button
                      title="Editar recorrente"
                      onClick={() => setEditingRecurring(r)}
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
                  </div>
                  <div className="auto-meta">
                    {category?.name} · {account?.name} {isCredit ? '(cartão)' : ''} · todo dia {r.day_of_month}
                  </div>
                </div>
              </div>
              <div className="auto-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div className="auto-val num">{fmt(r.amount)}</div>
                <button className={`mini-toggle${r.active ? '' : ' off'}`} onClick={() => toggleRecurring(r)} />
              </div>
            </div>
          );
        })}
      </div>

      <RecurringModal
        open={autoModalOpen || !!editingRecurring}
        recurring={editingRecurring}
        onClose={() => {
          setAutoModalOpen(false);
          setEditingRecurring(null);
        }}
        onCreated={() => {
          setAutoModalOpen(false);
          setEditingRecurring(null);
          reloadRecurring();
        }}
        onDeleted={() => {
          setEditingRecurring(null);
          reloadRecurring();
        }}
      />
    </div>
  );
}
