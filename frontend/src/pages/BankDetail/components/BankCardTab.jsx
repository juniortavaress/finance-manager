import { useMemo, useState } from 'react';
import { creditCardsApi } from '../../../api/resources';
import { useFetch } from '../../../hooks/useFetch';
import { fmt } from '../../../utils/format';
import { IconSearch } from '../../../components/icons';
import Skeleton from '../../../components/Skeleton';
import TransactionRow from './TransactionRow';

export default function BankCardTab({ cardId, invoice, currency, refreshKey, onEdit }) {
  const [search, setSearch] = useState('');
  const { data, loading } = useFetch(
    (signal) => (invoice ? creditCardsApi.invoice(cardId, invoice.id, signal) : Promise.resolve(null)),
    [cardId, invoice?.id, refreshKey]
  );

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.invoice?.transactions || []).filter(
      (t) => !term || t.description.toLowerCase().includes(term) || t.category?.name.toLowerCase().includes(term)
    );
  }, [data, search]);
  const total = items.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);

  return (
    <>
      <div className="card bank-filters">
        <div className="filter-bar">
          <div className="filter-search">
            <IconSearch />
            <input
              type="text"
              placeholder="Buscar por descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {loading && !data ? (
          <Skeleton width={260} height={16} style={{ marginBottom: 8 }} />
        ) : (
          <h3>
            {items.length} compras na fatura · <span style={{ color: 'var(--brick)' }}>{fmt(total, currency)}</span>
          </h3>
        )}
        {!loading && items.length === 0 && <div className="empty-state">Nenhuma compra encontrada.</div>}
        {items.map((tx) => (
          <TransactionRow key={tx.id} transaction={tx} currency={currency} onEdit={() => onEdit(tx)} />
        ))}
      </div>
    </>
  );
}
