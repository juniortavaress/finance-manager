import { useMemo, useState } from 'react';
import { fmt } from '../../utils/format';
import { IconSearch } from '../icons';
import Skeleton from '../Skeleton';

function assetValue(asset) {
  const { current_amount: current, invested_amount: invested } = asset.position;
  return current != null ? current : invested;
}

export default function BankInvestmentsTab({ account, assets, loading }) {
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((a) => !term || a.name.toLowerCase().includes(term) || (a.code || '').toLowerCase().includes(term));
  }, [assets, search]);
  const total = visible.reduce((sum, a) => sum + assetValue(a), 0);

  return (
    <>
      <div className="card bank-filters">
        <div className="filter-bar">
          <div className="filter-search">
            <IconSearch />
            <input type="text" placeholder="Buscar ativo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Skeleton width={260} height={16} style={{ marginBottom: 8 }} />
        ) : (
          <h3>
            {visible.length} ativos · <span style={{ color: 'var(--teal)' }}>{fmt(total, account.currency)}</span>
          </h3>
        )}
        {!search && (
          <div className="tx-row">
            <div className="tx-left">
              <div className="tx-icon" style={{ background: 'var(--teal-soft)' }}>
                💵
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tx-desc">Caixa disponível</div>
                <div className="tx-meta">Saldo não alocado da conta de investimento</div>
              </div>
            </div>
            <div className="tx-val num">{fmt(account.balance, account.currency)}</div>
          </div>
        )}
        {!loading && visible.length === 0 && <div className="empty-state">Nenhum ativo encontrado.</div>}
        {visible.map((asset) => (
          <div className="tx-row" key={asset.id}>
            <div className="tx-left">
              <div className="tx-icon" style={{ background: 'var(--gold-soft)' }}>
                📈
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tx-desc">{asset.name}</div>
                <div className="tx-meta">{asset.code || asset.type}</div>
              </div>
            </div>
            <div className="tx-val num">{fmt(assetValue(asset), account.currency)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
