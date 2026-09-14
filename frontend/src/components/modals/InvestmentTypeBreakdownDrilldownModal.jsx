import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

function AssetBreakdownRow({ label, value, pct, color }) {
  return (
    <div className="bank-row">
      <div className="bank-id">
        {color && <span className="bank-chip" style={{ background: color }} />}
        <div className="bank-name">{label}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="bank-val num">{fmt(value)}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{pct.toFixed(1)}%</div>
      </div>
    </div>
  );
}

export default function InvestmentTypeBreakdownDrilldownModal({ open, onClose, title, rows, emptyMessage, loading }) {
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
          <div className="list-scroll-hidden" style={{ maxHeight: 384 }}>
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
            {!loading &&
              rows.map((r) => (
                <AssetBreakdownRow key={r.label} label={r.label} value={r.value} pct={r.pct} color={r.color} />
              ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
