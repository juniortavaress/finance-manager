import { dashboardApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { fmt, fmtDateShort } from '../../utils/format';
import ModalShell from './ModalShell';

export default function InvoicesDrilldownModal({ open, onClose }) {
  const { data, loading } = useFetch(() => dashboardApi.periodInvoices(), []);
  const invoices = data?.invoices || [];

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <h2>Faturas em aberto</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body modal-body-scroll">
          {!loading && invoices.length === 0 && <div className="empty-state">Nenhuma fatura em aberto.</div>}
          {invoices.map((inv) => {
            const isLate = inv.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div className="fat-row" key={inv.id}>
                <div>
                  <div className="fat-bank">{inv.bank_name} · cartão</div>
                  <div className="fat-due">vence {fmtDateShort(inv.due_date)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="fat-val num">{fmt(inv.outstanding_amount)}</div>
                  <span className={`badge ${isLate ? 'danger' : 'warn'}`}>{isLate ? 'atrasada' : 'aberta'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
