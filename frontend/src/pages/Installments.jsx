import { useState } from 'react';
import { installmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconPencil, IconChevronDown } from '../components/icons';
import AdvanceInstallmentModal from '../components/modals/AdvanceInstallmentModal';
import CancelInstallmentModal from '../components/modals/CancelInstallmentModal';
import TransactionModal from '../components/modals/TransactionModal';
import Skeleton from '../components/Skeleton';

export default function Installments() {
  const { data, loading, reload } = useFetch(() => installmentsApi.list({ status: 'active' }), []);
  const { categoryById } = useData();
  const [advancePlan, setAdvancePlan] = useState(null);
  const [cancelPlan, setCancelPlan] = useState(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [editingTx, setEditingTx] = useState(null);

  const plans = data?.installment_plans || [];

  const totalMes = plans.reduce((s, p) => s + p.installment_amount, 0);
  const totalRestante = plans.reduce((s, p) => {
    const scheduledSum = p.transactions
      .filter((t) => t.status === 'scheduled')
      .reduce((acc, t) => acc + t.amount, 0);
    return s + scheduledSum;
  }, 0);

  const advanceScheduledTxs = advancePlan
    ? advancePlan.transactions.filter((t) => t.status === 'scheduled').sort((a, b) => a.installment_number - b.installment_number)
    : [];
  const cancelScheduledTxs = cancelPlan
    ? cancelPlan.transactions.filter((t) => t.status === 'scheduled').sort((a, b) => a.installment_number - b.installment_number)
    : [];

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Parcelas</h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={() => setNewModalOpen(true)}
        >
          + nova parcela
        </div>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Comprometido este mês</div>
          {loading ? <Skeleton width={110} height={24} /> : <div className="value num">{fmt(totalMes)}</div>}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Saldo total a parcelar</div>
          {loading ? <Skeleton width={110} height={24} /> : <div className="value num">{fmt(totalRestante)}</div>}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Parcelamentos ativos</div>
          {loading ? <Skeleton width={40} height={24} /> : <div className="value num">{plans.length}</div>}
        </div>
      </div>
      <div className="card">
        <h3>Todas as compras parceladas</h3>
        {loading &&
          [0, 1, 2].map((i) => (
            <div className="parc-item" key={i}>
              <div className="parc-top">
                <div className="parc-left">
                  <Skeleton width={36} height={36} radius={9} />
                  <div>
                    <Skeleton width={130} height={13} style={{ marginBottom: 5 }} />
                    <Skeleton width={90} height={11} />
                  </div>
                </div>
                <div className="parc-vals">
                  <Skeleton width={70} height={14} style={{ marginBottom: 5 }} />
                  <Skeleton width={90} height={11} />
                </div>
              </div>
              <Skeleton width="100%" height={6} radius={4} style={{ marginTop: 10 }} />
            </div>
          ))}
        {!loading && plans.length === 0 && <div className="empty-state">Nenhum parcelamento ativo.</div>}
        {!loading && plans.map((p) => {
          const category = categoryById(p.category_id) || p.category;
          const confirmedCount = p.transactions.filter((t) => t.status === 'confirmed').length;
          const currentInstallment = Math.max(confirmedCount, 1);
          const pct = (currentInstallment / p.installments_count) * 100;
          const scheduledTxs = p.transactions
            .filter((t) => t.status === 'scheduled')
            .sort((a, b) => a.installment_number - b.installment_number);
          const remaining = scheduledTxs.length;
          const nextTx = scheduledTxs[0];
          const allTxs = [...p.transactions].sort((a, b) => a.installment_number - b.installment_number);
          const isExpanded = expandedPlan === p.id;

          return (
            <div className="parc-item" key={p.id}>
              <div className="parc-top">
                <div className="parc-left">
                  <div className="parc-icon" style={{ background: `${category?.color_hex || '#8B9A97'}22` }}>
                    {category?.icon || '📁'}
                  </div>
                  <div>
                    <div className="parc-desc">{p.description}</div>
                    <div className="parc-meta">{category?.name}</div>
                  </div>
                </div>
                <div className="parc-vals">
                  <div className="parc-total num">
                    {fmt(p.installment_amount)}
                    <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>/mês</span>
                  </div>
                  <div className="parc-count">total {fmt(p.total_amount)}</div>
                </div>
              </div>
              <div className="parc-track">
                <div className="parc-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="parc-foot">
                <span>
                  parcela {currentInstallment} de {p.installments_count}
                </span>
                <span>
                  faltam {remaining}
                  {nextTx ? ` · próxima em ${fmtDateShort(nextTx.date)}` : ''}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                {scheduledTxs.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="filter-clear"
                      style={{ color: 'var(--teal)' }}
                      onClick={() => setAdvancePlan(p)}
                    >
                      Adiantar parcelas
                    </button>
                    <button
                      type="button"
                      className="filter-clear"
                      style={{ color: 'var(--brick)' }}
                      onClick={() => setCancelPlan(p)}
                    >
                      Cancelar parcelas
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="filter-clear"
                  style={{ color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setExpandedPlan(isExpanded ? null : p.id)}
                >
                  {isExpanded ? 'Ocultar parcelas' : 'Ver parcelas'}
                  <IconChevronDown
                    style={{ width: 12, height: 12, transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                  />
                </button>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  {allTxs.map((tx) => (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--ink-soft)' }}>
                        {tx.installment_number}/{p.installments_count} · {fmtDateShort(tx.date)}
                        {tx.status === 'confirmed' ? ' · paga' : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="num">{fmt(tx.amount)}</span>
                        <button
                          type="button"
                          title="Editar parcela"
                          onClick={() => setEditingTx(tx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--ink-faint)',
                            cursor: 'pointer',
                          }}
                        >
                          <IconPencil style={{ width: 13, height: 13 }} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AdvanceInstallmentModal
        open={!!advancePlan}
        plan={advancePlan}
        scheduledCount={advanceScheduledTxs.length}
        onClose={() => setAdvancePlan(null)}
        onDone={() => {
          setAdvancePlan(null);
          reload();
        }}
      />

      <CancelInstallmentModal
        open={!!cancelPlan}
        plan={cancelPlan}
        scheduledTxs={cancelScheduledTxs}
        onClose={() => setCancelPlan(null)}
        onDone={() => {
          setCancelPlan(null);
          reload();
        }}
      />

      <TransactionModal
        open={newModalOpen}
        installmentOnly
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          reload();
        }}
      />

      <TransactionModal
        open={!!editingTx}
        transaction={editingTx}
        onClose={() => setEditingTx(null)}
        onCreated={() => {
          setEditingTx(null);
          reload();
        }}
        onDeleted={() => {
          setEditingTx(null);
          reload();
        }}
      />
    </div>
  );
}
