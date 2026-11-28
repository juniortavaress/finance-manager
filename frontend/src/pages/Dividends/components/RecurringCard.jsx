import { fmt, monthLabel } from '../../../utils/format';
import { FREQUENCY_LABELS, assetLabel, blurAfterPointer } from '../utils/dividends';
import Skeleton from '../../../components/Skeleton';

/** Proventos recorrentes em ordem alfabetica, com a data do proximo pagamento. */
export default function RecurringCard({ schedules, loading, banksById, amountOf, onSelect }) {
  const sorted = [...schedules].sort((a, b) => assetLabel(a.asset).localeCompare(assetLabel(b.asset), 'pt-BR'));

  return (
    <section className="card dv-card dv-column">
      <div className="dv-head">
        <h2 className="dv-title">Recorrentes</h2>
      </div>
      <div className="dv-scroll" style={{ padding: '4px 16px 10px' }}>
        {loading &&
          [0, 1, 2, 3].map((i) => (
            <div className="dv-payer" key={i}>
              <Skeleton width="100%" height={34} radius={8} />
            </div>
          ))}
        {!loading && sorted.length === 0 && (
          <div className="empty-state">Nenhum provento recorrente cadastrado ainda.</div>
        )}
        {!loading &&
          sorted.map((s) => {
            const bank = banksById.get(s.bank_id);
            const amount = amountOf(s);
            return (
              <button
                type="button"
                key={s.id}
                className={`dv-recurring${s.active ? '' : ' paused'}`}
                onClick={(e) => {
                  blurAfterPointer(e);
                  onSelect(s);
                }}
              >
                <span className="dv-date">
                  <strong>{s.next_due_date.slice(8, 10)}</strong>
                  <span>{monthLabel(Number(s.next_due_date.slice(5, 7)))}</span>
                </span>
                <span className="dv-stripe" style={{ background: bank?.color_hex || 'var(--line)' }} />
                <span className="dv-grow">
                  <span className="dv-name">{assetLabel(s.asset)}</span>
                  <span className="dv-meta">
                    {[FREQUENCY_LABELS[s.frequency], bank?.name || s.bank_name, s.active ? null : 'pausado']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="num">{fmt(amount.value, amount.currency)}</span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
