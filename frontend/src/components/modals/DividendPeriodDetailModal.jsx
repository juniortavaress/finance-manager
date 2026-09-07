import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';

/**
 * Detalhamento por ativo de um periodo (mes ou ano) clicado no grafico de
 * historico de dividendos. `period` e' o item agregado ({ fullLabel, total,
 * byAsset: [{ assetId, code, name, total }] }) montado por quem abre o
 * modal (ver Dividends.jsx). Lista compacta (uma linha fina por ativo, sem
 * icone) porque um periodo pode facilmente ter 15-20+ ativos diferentes -
 * uma linha "pesada" por ativo (icone + duas linhas de texto) vira uma lista
 * enorme nesse cenario.
 */
export default function DividendPeriodDetailModal({ open, onClose, period }) {
  if (!open || !period) return null;

  const rows = [...(period.byAsset || [])].sort((a, b) => b.total - a.total);

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>{period.fullLabel}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 14 }}>
            <div className="asset-card-label">Total recebido</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
              {fmt(period.total)}
            </div>
          </div>

          <div className="modal-body-scroll" style={{ margin: 0, padding: 0, minHeight: 0 }}>
            {rows.map((r) => (
              <div
                key={r.assetId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  fontSize: 13,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ color: 'var(--ink-soft)' }}>{r.code || r.name}</span>
                <span className="num">{fmt(r.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
