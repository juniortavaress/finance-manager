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
            account_type: categoryId ? undefined : 'checking',
            is_invoice_payment: false,
            is_transfer: false,
            status: 'confirmed',
            page_size: 200,
          }),
    [year, month, type, categoryId]
  );
  const pos = type === 'income';

  let items;
  if (isMonthlyExpenseCard) {
    const txItems = (data?.transactions || []).map((t) => {
      const category = categoryById(t.category_id) || t.category;
      return {
        key: `tx-${t.id}`,
        date: t.date,
        icon: category?.icon || '📁',
        desc: t.description,
        meta: `${t.account?.name} · ${fmtDateShort(t.date)}`,
        amount: t.amount,
        scheduled: false,
      };
    });
    const invoiceItems = (data?.invoices || []).map((inv) => ({
      key: `inv-${inv.id}`,
      date: inv.closing_date,
      icon: '💳',
      desc: `${inv.bank_name} · cartão`,
      meta: `fechou ${fmtDateShort(inv.closing_date)}`,
      amount: inv.total_amount,
      scheduled: false,
    }));
    const scheduledItems = (data?.scheduled || []).map((s) => ({
      key: `sch-${s.id}`,
      date: s.due_date,
      icon: s.category?.icon || '📁',
      desc: s.description,
      meta: `vence ${fmtDateShort(s.due_date)}`,
      amount: s.amount,
      scheduled: true,
    }));
    items = [...txItems, ...invoiceItems, ...scheduledItems].sort((a, b) => (a.date < b.date ? 1 : -1));
  } else {
    items = (data?.transactions || []).map((t) => {
      const category = categoryById(t.category_id) || t.category;
      return {
        key: `tx-${t.id}`,
        date: t.date,
        icon: category?.icon || '📁',
        desc: t.description,
        meta: `${t.account?.name} · ${fmtDateShort(t.date)}`,
        amount: t.amount,
        scheduled: false,
      };
    });
  }

  const scheduledTotal = items.filter((i) => i.scheduled).reduce((sum, i) => sum + i.amount, 0);
  const grandTotal = items.reduce((sum, i) => sum + i.amount, 0);

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
          {!initialLoading && items.length === 0 && (
            <div className="empty-state">Nenhuma transação neste período.</div>
          )}
          {!initialLoading &&
            items.map((item) => (
              <div className="tx-row" key={item.key}>
                <div className="tx-left">
                  <div className="tx-icon" style={{ background: item.scheduled ? 'var(--bg)' : pos ? 'var(--teal-soft)' : 'var(--bg)' }}>
                    {item.icon}
                  </div>
                  <div>
                    <div className="tx-desc">{item.desc}</div>
                    <div className="tx-meta">{item.meta}</div>
                  </div>
                </div>
                <div
                  className={`tx-val num ${item.scheduled ? '' : pos ? 'pos' : 'neg'}`}
                  style={item.scheduled ? { color: 'var(--ink-faint)' } : undefined}
                >
                  {item.scheduled ? fmt(item.amount) : fmt(pos ? item.amount : -item.amount)}
                </div>
              </div>
            ))}
        </div>
        {!initialLoading && scheduledTotal > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 24px',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Total com programados</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {fmt(grandTotal)}
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
