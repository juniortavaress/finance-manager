import { useState } from 'react';
import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

export default function DividendsDrilldownModal({ open, onClose, byMonth, byYear, loading }) {
  const [view, setView] = useState('month');
  if (!open) return null;

  const rows = view === 'month' ? byMonth : byYear;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Dividendos</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="seg" style={{ marginBottom: 14 }}>
            <div className={`seg-opt${view === 'month' ? ' active' : ''}`} onClick={() => setView('month')}>
              Mês a mês
            </div>
            <div className={`seg-opt${view === 'year' ? ' active' : ''}`} onClick={() => setView('year')}>
              Anual
            </div>
          </div>

          <div className="modal-body-scroll" style={{ margin: 0, padding: 0, minHeight: 0 }}>
            {loading &&
              [0, 1, 2].map((i) => (
                <div className="bank-row" key={i}>
                  <div className="bank-id">
                    <Skeleton width={110} height={13} />
                  </div>
                  <Skeleton width={70} height={14} />
                </div>
              ))}
            {!loading && rows.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Nenhum provento recebido ainda.</p>
            )}
            {!loading && rows.map((r) => (
              <div className="bank-row" key={r.label}>
                <div className="bank-id">
                  <div className="bank-name">{r.label}</div>
                </div>
                <div className="bank-val num">{fmt(r.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
