import { useState } from 'react';
import { useData } from '../context/DataContext';
import { recurringApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconPencil, IconBell, IconCheck } from '../components/icons';
import RecurringModal from '../components/modals/RecurringModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RecurringTransactions() {
  const { categoryById, accountById } = useData();
  const { showSuccess, showError } = useToast();
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payingRecurring, setPayingRecurring] = useState(null);

  const { data: recurringData, reload: reloadRecurring } = useFetch(() => recurringApi.list(), []);
  const recurringList = recurringData?.recurring_transactions || [];
  const activeRecurring = recurringList.filter((r) => r.active);
  const totalCommitted = activeRecurring.reduce((s, r) => s + r.amount, 0);

  const today = todayIso();
  const manualActive = activeRecurring.filter((r) => !r.auto_debit);
  const overdue = manualActive.filter((r) => !r.paid_at && r.current_due_date < today);
  const dueToday = manualActive.filter((r) => !r.paid_at && r.current_due_date === today);

  async function toggleRecurring(recurring) {
    try {
      await recurringApi.update(recurring.id, { active: !recurring.active });
      showSuccess(recurring.active ? 'Recorrente pausado.' : 'Recorrente ativado.');
      reloadRecurring();
    } catch (err) {
      showError(err.message || 'Não foi possível atualizar o recorrente.');
    }
  }

  async function handleMarkPaid() {
    const recurring = payingRecurring;
    setPayingId(recurring.id);
    try {
      await recurringApi.markPaid(recurring.id);
      showSuccess('Marcado como pago — transação criada.');
      setPayingRecurring(null);
      reloadRecurring();
    } finally {
      setPayingId(null);
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

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Total comprometido por mês</div>
          <div className="value num">{fmt(totalCommitted)}</div>
          <div className="delta">{activeRecurring.length} recorrentes ativos</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Vencendo hoje</div>
          <div className="value num">{dueToday.length}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Atrasados</div>
          <div className="value num">{overdue.length}</div>
        </div>
      </div>

      <div className="card">
        <h3>Recorrentes cadastrados</h3>
        {recurringList.length === 0 && <div className="empty-state">Nenhum recorrente cadastrado.</div>}
        {recurringList.map((r) => {
          const category = categoryById(r.category_id) || r.category;
          const account = accountById(r.account_id) || r.account;
          const isCredit = r.payment_method === 'credit';
          const isManual = !r.auto_debit;
          const isOverdue = isManual && !r.paid_at && r.current_due_date < today;
          const isPaid = isManual && !!r.paid_at;
          return (
            <div className="auto-row" key={r.id}>
              <div className="auto-left">
                <div
                  className="auto-icon"
                  style={{ background: isOverdue ? 'var(--brick-soft)' : `${category?.color_hex || '#8B9A97'}22` }}
                >
                  {isOverdue ? <IconBell style={{ width: 16, height: 16, color: 'var(--brick)' }} /> : category?.icon || '📁'}
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
                    {isManual && !isPaid && (
                      <button
                        title="Marcar como pago"
                        onClick={() => setPayingRecurring(r)}
                        disabled={payingId === r.id}
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
                          e.currentTarget.style.background = 'var(--teal-soft, #0F5C5C22)';
                          e.currentTarget.style.color = 'var(--teal)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--ink-faint)';
                        }}
                      >
                        <IconCheck style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                    {isOverdue && (
                      <span className="badge warn" style={{ background: 'var(--brick-soft)', color: 'var(--brick)' }}>
                        atrasado
                      </span>
                    )}
                    {isPaid && <span className="badge ok">pago</span>}
                  </div>
                  <div className="auto-meta">
                    {category?.name} · {account?.name} {isCredit ? '(cartão)' : ''} ·{' '}
                    {isManual ? `vence em ${fmtDateShort(r.current_due_date)}` : `todo dia ${r.day_of_month}`}
                  </div>
                </div>
              </div>
              <div className="auto-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div className="auto-val num" style={{ color: r.type === 'income' ? 'var(--teal)' : undefined }}>
                  {fmt(r.amount)}
                </div>
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

      <ConfirmDeleteModal
        open={!!payingRecurring}
        onClose={() => setPayingRecurring(null)}
        onConfirm={handleMarkPaid}
        title="Marcar como pago"
        message="Ao marcar como pago, uma transação é criada nesta conta (ou na fatura aberta, se for cartão) com os dados cadastrados aqui."
        confirmLabel="Marcar como pago"
        confirmingLabel="Confirmando..."
        confirmVariant="primary"
        errorFallback="Não foi possível marcar como pago."
      />
    </div>
  );
}
