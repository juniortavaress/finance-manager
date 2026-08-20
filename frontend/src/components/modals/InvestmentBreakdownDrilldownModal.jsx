import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

function BreakdownRow({ label, value, color, original, originalCurrency }) {
  return (
    <div className="bank-row">
      <div className="bank-id">
        {color && <span className="bank-chip" style={{ background: color }} />}
        <div className="bank-name">{label}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="bank-val num">{fmt(value)}</div>
        {original != null && (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{fmt(original, originalCurrency)}</div>
        )}
      </div>
    </div>
  );
}

export default function InvestmentBreakdownDrilldownModal({ open, onClose, title, rows, emptyMessage, loading }) {
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
          {loading &&
            [0, 1, 2].map((i) => (
              <div className="bank-row" key={i}>
                <div className="bank-id">
                  <Skeleton width={8} height={8} radius={2} />
                  <Skeleton width={110} height={13} />
                </div>
                <Skeleton width={70} height={14} />
              </div>
            ))}
          {!loading && rows.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>{emptyMessage || 'Nenhum dado disponível.'}</p>
          )}
          {!loading && rows.map((r) => (
            <BreakdownRow
              key={r.label}
              label={r.label}
              value={r.value}
              color={r.color}
              original={r.original}
              originalCurrency={r.originalCurrency}
            />
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
