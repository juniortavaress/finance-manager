import { quotesApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { fmt } from '../utils/format';
import Skeleton from '../components/Skeleton';

function fmtUpdatedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Quotes() {
  const { data, initialLoading } = useFetch(() => quotesApi.list(), []);
  const quotes = data?.quotes || [];
  const updatedAt = fmtUpdatedAt(data?.updated_at);

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Cotações</h1>
        {updatedAt && <div className="period">atualizado {updatedAt}</div>}
      </div>

      <div className="card">
        <h3>Moedas em relação ao Real</h3>
        {initialLoading &&
          [0, 1, 2].map((i) => (
            <div className="bank-row" key={i}>
              <div className="bank-id">
                <Skeleton width={140} height={13} />
              </div>
              <Skeleton width={70} height={14} />
            </div>
          ))}
        {!initialLoading && quotes.length === 0 && (
          <div className="empty-state">Não foi possível obter as cotações agora. Tente novamente mais tarde.</div>
        )}
        {!initialLoading &&
          quotes.map((q) => (
            <div className="bank-row" key={q.currency}>
              <div className="bank-id">
                <div>
                  <div className="bank-name">{q.label}</div>
                  <div className="bank-sub">1 {q.currency}</div>
                </div>
              </div>
              <div className="bank-val num">{fmt(q.brl_rate)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
