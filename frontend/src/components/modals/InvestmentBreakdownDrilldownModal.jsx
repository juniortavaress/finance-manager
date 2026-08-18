import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';

function BreakdownRow({ label, value, color }) {
  return (
    <div className="bank-row">
      <div className="bank-id">
        {color && <span className="bank-chip" style={{ background: color }} />}
        <div className="bank-name">{label}</div>
      </div>
      <div className="bank-val num">{fmt(value)}</div>
    </div>
  );
}

export default function InvestmentBreakdownDrilldownModal({ open, onClose, title, rows, emptyMessage }) {
  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {rows.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>{emptyMessage || 'Nenhum dado disponível.'}</p>
          )}
          {rows.map((r) => (
            <BreakdownRow key={r.label} label={r.label} value={r.value} color={r.color} />
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
