import { transactionsApi, dashboardApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { useData } from '../../context/DataContext';
import { fmt, fmtDateShort } from '../../utils/format';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

function lastDayIso(year, month) {
  return new Date(year, month, 0).toISOString().slice(0, 10);
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
  const pos = type === 'income';

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
          {!initialLoading && transactions.length === 0 && (
            <div className="empty-state">Nenhuma transação neste período.</div>
          )}
          {!initialLoading && transactions.map((t) => {
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
        </div>
      </div>
    </ModalShell>
  );
}
