import { transactionsApi, dashboardApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { useData } from '../../context/DataContext';
import { fmt, fmtDateShort } from '../../utils/format';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

function lastDayIso(year, month) {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '18px 0 8px' }}>
      {children}
    </div>
  );
}

export default function TransactionsDrilldownModal({ open, onClose, title, year, month, type, categoryId }) {
  const { categoryById } = useData();
  const isMonthlyExpenseCard = type === 'expense' && !categoryId;
  const { data, initialLoading } = useFetch(
    () =>
      isMonthlyExpenseCard
        ? dashboardApi.expenseBreakdown(year, month)
        : transactionsApi.list({
            date_from: `${year}-${String(month).padStart(2, '0')}-01`,
            date_to: lastDayIso(year, month),
            type,
            category_id: categoryId || undefined,
            account_type: 'checking',
            is_invoice_payment: false,
            is_transfer: false,
            status: 'confirmed',
            page_size: 200,
          }),
    [year, month, type, categoryId]
  );
  const transactions = data?.transactions || [];
  const invoices = data?.invoices || [];
  const scheduled = data?.scheduled || [];
  const pos = type === 'income';
  const isEmpty = isMonthlyExpenseCard
    ? transactions.length === 0 && invoices.length === 0 && scheduled.length === 0
    : transactions.length === 0;

  const confirmedTotal =
    transactions.reduce((sum, t) => sum + t.amount, 0) + invoices.reduce((sum, i) => sum + i.total_amount, 0);
  const scheduledTotal = scheduled.reduce((sum, s) => sum + s.amount, 0);
  const grandTotal = confirmedTotal + scheduledTotal;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body modal-body-scroll">
          {initialLoading &&
            [0, 1, 2, 3, 4].map((i) => (
              <div className="tx-row" key={i}>
                <div className="tx-left">
                  <Skeleton width={34} height={34} radius={8} />
                  <div>
                    <Skeleton width={140} height={13} style={{ marginBottom: 6 }} />
                    <Skeleton width={90} height={11} />
                  </div>
                </div>
                <Skeleton width={70} height={14} />
              </div>
            ))}
          {!initialLoading && isEmpty && <div className="empty-state">Nenhuma transação neste período.</div>}

          {!initialLoading && isMonthlyExpenseCard && invoices.length > 0 && (
            <>
              <SectionTitle>Faturas de cartão</SectionTitle>
              {invoices.map((inv) => (
                <div className="fat-row" key={inv.id}>
                  <div>
                    <div className="fat-bank">{inv.bank_name} · cartão</div>
                    <div className="fat-due">fechou {fmtDateShort(inv.closing_date)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="fat-val num">{fmt(inv.total_amount)}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {!initialLoading && isMonthlyExpenseCard && transactions.length > 0 && (
            <SectionTitle>Conta corrente</SectionTitle>
          )}
          {!initialLoading &&
            transactions.map((t) => {
              const category = categoryById(t.category_id) || t.category;
              return (
                <div className="tx-row" key={t.id}>
                  <div className="tx-left">
                    <div className="tx-icon" style={{ background: pos ? 'var(--teal-soft)' : 'var(--bg)' }}>
                      {category?.icon || '📁'}
                    </div>
                    <div>
                      <div className="tx-desc">{t.description}</div>
                      <div className="tx-meta">
                        {t.account?.name} · {fmtDateShort(t.date)}
                      </div>
                    </div>
                  </div>
                  <div className={`tx-val num ${pos ? 'pos' : 'neg'}`}>
                    {fmt(pos ? t.amount : -t.amount, t.account?.currency)}
                  </div>
                </div>
              );
            })}

          {!initialLoading && isMonthlyExpenseCard && scheduled.length > 0 && (
            <>
              <SectionTitle>Gastos programados</SectionTitle>
              {scheduled.map((s) => (
                <div className="tx-row" key={s.id}>
                  <div className="tx-left">
                    <div className="tx-icon" style={{ background: 'var(--bg)' }}>
                      {s.category?.icon || '📁'}
                    </div>
                    <div>
                      <div className="tx-desc">{s.description}</div>
                      <div className="tx-meta">vence {fmtDateShort(s.due_date)}</div>
                    </div>
                  </div>
                  <div className="tx-val num" style={{ color: 'var(--ink-faint)' }}>
                    {fmt(s.amount)}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {!initialLoading && isMonthlyExpenseCard && scheduled.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 24px',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
              Total com programados
            </span>
            <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {fmt(grandTotal)}
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
