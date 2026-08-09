import { useState } from 'react';
import { remindersApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconPencil, IconBell, IconCheck } from '../components/icons';
import BillReminderModal from '../components/modals/BillReminderModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function BillReminders() {
  const { data, loading, reload } = useFetch(() => remindersApi.list(), []);
  const { categoryById, accountById } = useData();
  const { showSuccess } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payingReminder, setPayingReminder] = useState(null);

  const reminders = (data?.bill_reminders || []).filter((r) => r.active);
  const today = todayIso();

  const overdue = reminders.filter((r) => !r.paid_at && r.current_due_date < today);
  const dueToday = reminders.filter((r) => !r.paid_at && r.current_due_date === today);
  const paidThisMonth = reminders.filter((r) => r.paid_at);

  async function handleMarkPaid() {
    const reminder = payingReminder;
    setPayingId(reminder.id);
    try {
      await remindersApi.markPaid(reminder.id);
      showSuccess('Lembrete marcado como pago — transação criada.');
      setPayingReminder(null);
      reload();
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Lembretes</h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={() => {
            setEditingReminder(null);
            setModalOpen(true);
          }}
        >
          + lembrete
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Vencendo hoje</div>
          <div className="value num">{dueToday.length}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Atrasados</div>
          <div className="value num">{overdue.length}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Pagos este período</div>
          <div className="value num">{paidThisMonth.length}</div>
        </div>
      </div>

      <div className="card">
        <h3>Contas cadastradas</h3>
        {!loading && reminders.length === 0 && <div className="empty-state">Nenhum lembrete cadastrado.</div>}
        {reminders.map((r) => {
          const category = categoryById(r.category_id) || r.category;
          const account = accountById(r.account_id) || r.account;
          const isOverdue = !r.paid_at && r.current_due_date < today;
          const isPaid = !!r.paid_at;

          return (
            <div className="parc-item" key={r.id}>
              <div className="parc-top">
                <div className="parc-left">
                  <div
                    className="parc-icon"
                    style={{ background: isOverdue ? 'var(--brick-soft)' : `${category?.color_hex || '#8B9A97'}22` }}
                  >
                    {isOverdue ? <IconBell style={{ width: 16, height: 16, color: 'var(--brick)' }} /> : category?.icon || '📁'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="parc-desc">{r.description}</div>
                      <button
                        title="Editar lembrete"
                        onClick={() => {
                          setEditingReminder(r);
                          setModalOpen(true);
                        }}
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
                      {!isPaid && (
                        <button
                          title="Marcar como pago"
                          onClick={() => setPayingReminder(r)}
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
                      {isPaid && (
                        <span className="badge ok">pago</span>
                      )}
                    </div>
                    <div className="parc-meta">
                      {category?.name} · {account?.name}
                    </div>
                  </div>
                </div>
                <div className="parc-vals">
                  <div className="parc-total num">{fmt(r.amount)}</div>
                  <div className="parc-count">vence em {fmtDateShort(r.current_due_date)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BillReminderModal
        open={modalOpen}
        reminder={editingReminder}
        onClose={() => {
          setModalOpen(false);
          setEditingReminder(null);
        }}
        onCreated={() => {
          setModalOpen(false);
          setEditingReminder(null);
          reload();
        }}
        onDeleted={() => {
          setEditingReminder(null);
          reload();
        }}
      />

      <ConfirmDeleteModal
        open={!!payingReminder}
        onClose={() => setPayingReminder(null)}
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
