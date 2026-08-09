import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { transactionsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { fmt, fmtDateShort } from '../utils/format';
import { IconSearch, IconPencil, IconChevronDown } from '../components/icons';
import TransactionModal from '../components/modals/TransactionModal';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function RowActionButton({ title, onClick, color, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-faint)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg)';
        e.currentTarget.style.color = color || 'var(--teal)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--ink-faint)';
      }}
    >
      {children}
    </button>
  );
}

export default function Transactions() {
  const { banks, categories, categoryById, accountById } = useData();
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);

  const { data: txData, reload: reloadTx } = useFetch(
    () =>
      transactionsApi.list({
        search: search || undefined,
        category_id: categoryFilter || undefined,
        type: typeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || todayIso(),
        page_size: 100,
      }),
    [search, categoryFilter, typeFilter, dateFrom, dateTo]
  );

  const transactions = txData?.transactions || [];
  const filteredByBank = useMemo(() => {
    if (!bankFilter) return transactions;
    return transactions.filter((t) => {
      const account = accountById(t.account_id) || t.account;
      return account?.bank_id === bankFilter;
    });
  }, [transactions, bankFilter, accountById]);

  const entradas = filteredByBank.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const saidas = filteredByBank.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const hasActiveFilters = !!(search || bankFilter || categoryFilter || typeFilter || dateFrom || dateTo);

  function clearFilters() {
    setSearch('');
    setBankFilter('');
    setCategoryFilter('');
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Transações</h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={() => setTxModalOpen(true)}
        >
          + nova transação
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 6 }}>
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
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12.5,
              color: 'var(--ink-soft)',
              cursor: 'pointer',
            }}
          >
            Filtros
            <IconChevronDown
              style={{ width: 12, height: 12, transition: 'transform 0.15s ease', transform: filtersOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              fontSize: 12,
              fontWeight: 500,
              color: hasActiveFilters ? 'var(--teal)' : 'var(--ink-faint)',
              cursor: hasActiveFilters ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            ✕ Limpar
          </button>
        </div>

        {filtersOpen && (
          <div className="filter-bar" style={{ paddingTop: 0 }}>
            <div className="filter-select">
              <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
                <option value="">Todos os bancos</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
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
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12.5,
                color: 'var(--ink-soft)',
                fontFamily: 'inherit',
              }}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12.5,
                color: 'var(--ink-soft)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}
      </div>
      <div className="card">
        <h3>
          {filteredByBank.length} transações · <span style={{ color: 'var(--teal)' }}>entradas {fmt(entradas)}</span>{' '}
          · <span style={{ color: 'var(--brick)' }}>saídas {fmt(saidas)}</span>
        </h3>
        {filteredByBank.length === 0 && <div className="empty-state">Nenhuma transação encontrada.</div>}
        {filteredByBank.map((t) => {
          const pos = t.type === 'income';
          const category = categoryById(t.category_id) || t.category;
          const account = accountById(t.account_id) || t.account;
          return (
            <div className="tx-row" key={t.id}>
              <div className="tx-left">
                <div className="tx-icon" style={{ background: pos ? 'var(--teal-soft)' : 'var(--bg)' }}>
                  {category?.icon || '📁'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div className="tx-desc">{t.description}</div>
                    <RowActionButton title="Editar transação" onClick={() => setEditingTx(t)}>
                      <IconPencil style={{ width: 13, height: 13 }} />
                    </RowActionButton>
                  </div>
                  <div className="tx-meta">
                    {account?.name} · {fmtDateShort(t.date)}
                    {t.status === 'scheduled' ? ' · agendada' : ''}
                  </div>
                </div>
              </div>
              <div className={`tx-val num ${pos ? 'pos' : 'neg'}`}>{fmt(pos ? t.amount : -t.amount)}</div>
            </div>
          );
        })}
      </div>

      <TransactionModal
        open={txModalOpen || !!editingTx}
        transaction={editingTx}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        onCreated={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          reloadTx();
        }}
        onDeleted={() => {
          setEditingTx(null);
          reloadTx();
        }}
      />
    </div>
  );
}
