import { useEffect, useMemo, useState } from 'react';
import { transactionsApi } from '../../../api/resources';
import { useFetch } from '../../../hooks/useFetch';
import { fmt } from '../../../utils/format';
import { IconSearch, IconChevronDown } from '../../../components/icons';
import LoadMoreButton from '../../../components/LoadMoreButton';
import Skeleton from '../../../components/Skeleton';
import TransactionRow from './TransactionRow';

const PAGE_SIZE = 30;

function signedAmount(tx) {
  return tx.type === 'income' ? tx.amount : -tx.amount;
}

function monthRange(ym) {
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export default function BankTransactionsTab({ account, categories, month, isCurrentMonth, refreshKey, onEdit }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { from: dateFrom, to: dateTo } = monthRange(month);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [debouncedSearch, categoryFilter, typeFilter, dateFrom, dateTo, account.id, refreshKey]);

  const { data, loading } = useFetch(
    (signal) =>
      transactionsApi.list(
        {
          account_id: account.id,
          status: 'confirmed',
          search: debouncedSearch || undefined,
          category_id: categoryFilter || undefined,
          type: typeFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal
      ),
    [account.id, debouncedSearch, categoryFilter, typeFilter, dateFrom, dateTo, page, refreshKey]
  );

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (page === 1 ? data.transactions : [...prev, ...data.transactions]));
  }, [data, page]);

  // O saldo corrido so e conhecido a partir de hoje; meses passados nao tem como calcular.
  const hasFilters = !!(debouncedSearch || categoryFilter || typeFilter || !isCurrentMonth);

  const rows = useMemo(() => {
    let running = account.balance;
    return accumulated.map((tx) => {
      const row = { tx, balanceAfter: hasFilters ? undefined : running };
      running -= signedAmount(tx);
      return row;
    });
  }, [accumulated, account.balance, hasFilters]);

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
          <button type="button" className="filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
            Filtros
            <IconChevronDown style={{ width: 12, height: 12, transform: filtersOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>
        {filtersOpen && (
          <div className="filter-bar" style={{ paddingTop: 0 }}>
            <div className="filter-select">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-select">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Receitas e despesas</option>
                <option value="income">Só receitas</option>
                <option value="expense">Só despesas</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        {loading && accumulated.length === 0 ? (
          <Skeleton width={260} height={16} style={{ marginBottom: 8 }} />
        ) : (
          <h3>
            {data?.total || 0} transações ·{' '}
            <span style={{ color: 'var(--teal)' }}>entradas {fmt(data?.sum_income || 0, account.currency)}</span> ·{' '}
            <span style={{ color: 'var(--brick)' }}>saídas {fmt(data?.sum_expense || 0, account.currency)}</span>
          </h3>
        )}
        {!loading && rows.length === 0 && <div className="empty-state">Nenhuma transação encontrada.</div>}
        {rows.map(({ tx, balanceAfter }) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            currency={account.currency}
            balanceAfter={balanceAfter}
            onEdit={() => onEdit(tx)}
          />
        ))}
        <LoadMoreButton
          shown={accumulated.length}
          total={data?.total || 0}
          loading={loading}
          onClick={() => setPage((p) => p + 1)}
        />
      </div>
    </>
  );
}
