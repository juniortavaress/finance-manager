import { transactionsApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { useData } from '../../context/DataContext';
import { fmt, fmtDateShort } from '../../utils/format';
import ModalShell from './ModalShell';

function lastDayIso(year, month) {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

export default function TransactionsDrilldownModal({ open, onClose, title, year, month, type }) {
  const { categoryById } = useData();
  const { data, loading } = useFetch(
    () =>
      transactionsApi.list({
        date_from: `${year}-${String(month).padStart(2, '0')}-01`,
        date_to: lastDayIso(year, month),
        type,
        is_invoice_payment: false,
        is_transfer: false,
        status: 'confirmed',
        page_size: 200,
      }),
    [year, month, type]
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
          {!loading && transactions.length === 0 && (
            <div className="empty-state">Nenhuma transação neste período.</div>
          )}
          {transactions.map((t) => {
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
                <div className={`tx-val num ${pos ? 'pos' : 'neg'}`}>{fmt(pos ? t.amount : -t.amount)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
