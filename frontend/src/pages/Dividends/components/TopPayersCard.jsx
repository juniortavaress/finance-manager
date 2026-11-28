import { useState } from 'react';
import { fmt } from '../../../utils/format';
import { assetLabel, formatPercent } from '../utils/dividends';
import Skeleton from '../../../components/Skeleton';

function InfoTip({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="dv-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        aria-label="Como é calculado"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span role="tooltip" className="dv-tip-bubble">
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * Ranking dos ativos que mais pagaram nos ultimos 12 meses, por valor recebido
 * ou por yield sobre o preco medio pago.
 */
export default function TopPayersCard({ payers, loading, yieldLoading, bankOf }) {
  const [metric, setMetric] = useState('value');
  const byYield = metric === 'yield';

  // Sem yield calculavel (posicao zerada, por exemplo) vai para o fim.
  const score = (p) => (byYield ? (p.yieldOnCost ?? -1) : p.value);
  const sorted = [...payers].sort((a, b) => score(b) - score(a));
  const top = sorted.length ? score(sorted[0]) : 0;

  const codes = payers.map((p) => assetLabel(p.asset));
  const isRepeated = (label) => codes.indexOf(label) !== codes.lastIndexOf(label);
  const yieldText = (p) => {
    if (p.yieldOnCost !== null) return formatPercent(p.yieldOnCost);
    return yieldLoading ? '…' : '—';
  };

  return (
    <section className="card dv-card dv-column">
      <div className="dv-head">
        <div className="dv-title-row">
          <h2 className="dv-title">Maiores pagadores</h2>
          <InfoTip>
            Últimos 12 meses.
            <br />
            Yield sobre o preço médio pago.
            <br />
            Com menos de 1 ano, o yield é projetado.
          </InfoTip>
        </div>
        <div className="dv-toggle" role="group" aria-label="Ordenar pagadores por">
          <button type="button" className={byYield ? '' : 'active'} aria-pressed={!byYield} onClick={() => setMetric('value')}>
            Valor
          </button>
          <button type="button" className={byYield ? 'active' : ''} aria-pressed={byYield} onClick={() => setMetric('yield')}>
            Yield
          </button>
        </div>
      </div>
      <div className="dv-scroll" style={{ padding: '6px 22px 10px' }}>
        {loading &&
          [0, 1, 2, 3].map((i) => (
            <div className="dv-payer" key={i}>
              <Skeleton width="100%" height={22} radius={6} />
            </div>
          ))}
        {!loading && sorted.length === 0 && (
          <div className="empty-state">Nenhum recebimento nos últimos 12 meses.</div>
        )}
        {!loading &&
          sorted.map((p) => {
            const bank = bankOf(p.asset);
            const label = assetLabel(p.asset);
            return (
              <div className="dv-payer" key={p.assetId}>
                <div className="dv-payer-line">
                  <span className="dv-name">
                    {label}
                    {isRepeated(label) && <small>{bank?.name}</small>}
                  </span>
                  <span className="num dv-meta">{byYield ? fmt(p.value) : yieldText(p)}</span>
                  <strong className="num" style={{ minWidth: 92, textAlign: 'right', fontSize: 14 }}>
                    {byYield ? yieldText(p) : fmt(p.value)}
                  </strong>
                </div>
                <div className="dv-track">
                  <div
                    style={{
                      width: `${top > 0 ? Math.max(score(p) / top, 0) * 100 : 0}%`,
                      background: bank?.color_hex || 'var(--teal)',
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
