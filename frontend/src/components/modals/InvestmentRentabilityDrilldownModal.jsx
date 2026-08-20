import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

function RentRow({ label, value }) {
  const hasValue = value != null;
  return (
    <div className="bank-row">
      <div className="bank-id">
        <div className="bank-name">{label}</div>
      </div>
      <div
        className="bank-val num"
        style={{ color: !hasValue ? undefined : value >= 0 ? 'var(--teal)' : 'var(--brick)' }}
      >
        {hasValue ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—'}
      </div>
    </div>
  );
}

export default function InvestmentRentabilityDrilldownModal({
  open,
  onClose,
  loading,
  rentabilityTotal,
  rentabilityLastMonth,
  rentabilityLastYear,
}) {
  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Rentabilidade</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div className="bank-row" key={i}>
                <div className="bank-id">
                  <Skeleton width={140} height={13} />
                </div>
                <Skeleton width={50} height={14} />
              </div>
            ))
          ) : (
            <>
              <RentRow label="Acumulada (desde o início)" value={rentabilityTotal} />
              <RentRow label="Últimos 12 meses" value={rentabilityLastYear} />
              <RentRow label="Último mês" value={rentabilityLastMonth} />
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
