import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { transactionsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { fmt, fmtDateShort } from '../utils/format';
import { IconSearch, IconPencil, IconChevronDown } from '../components/icons';
import TransactionModal from '../components/modals/TransactionModal';
import LoadMoreButton from '../components/LoadMoreButton';

const PAGE_SIZE = 50;

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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [debouncedSearch, bankFilter, accountTypeFilter, categoryFilter, typeFilter, dateFrom, dateTo]);

  const { data: txData, reload: reloadTx, loading: txLoading } = useFetch(
    (signal) =>
      transactionsApi.list(
        {
          search: debouncedSearch || undefined,
          bank_id: bankFilter || undefined,
          account_type: accountTypeFilter || undefined,
          category_id: categoryFilter || undefined,
          type: typeFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || (dateFrom ? undefined : todayIso()),
          page,
          page_size: PAGE_SIZE,
        },
        signal
      ),
    [debouncedSearch, bankFilter, accountTypeFilter, categoryFilter, typeFilter, dateFrom, dateTo, page]
  );

  useEffect(() => {
    if (!txData) return;
    setAccumulated((prev) => (page === 1 ? txData.transactions : [...prev, ...txData.transactions]));
  }, [txData, page]);

  function reloadFromStart() {
    if (page === 1) reloadTx();
    else setPage(1);
  }

  const transactions = accumulated;
  const total = txData?.total || 0;
  const entradas = txData?.sum_income || 0;
  const saidas = txData?.sum_expense || 0;

  const hasActiveFilters = !!(
    search ||
    bankFilter ||
    accountTypeFilter ||
    categoryFilter ||
    typeFilter ||
    dateFrom ||
    dateTo
  );

  function clearFilters() {
    setSearch('');
    setBankFilter('');
    setAccountTypeFilter('');
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
              <select value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value)}>
                <option value="">Contas e cartões</option>
                <option value="checking">Conta corrente</option>
                <option value="credit_card">Cartão de crédito</option>
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
          {total} transações · <span style={{ color: 'var(--teal)' }}>entradas {fmt(entradas)}</span>{' '}
          · <span style={{ color: 'var(--brick)' }}>saídas {fmt(saidas)}</span>
        </h3>
        {transactions.length === 0 && <div className="empty-state">Nenhuma transação encontrada.</div>}
        {transactions.map((t) => {
          const pos = t.type === 'income';
          const category = categoryById(t.category_id) || t.category;
          const account = accountById(t.account_id) || t.account;
          return (
            <div className="tx-row" key={t.id}>
              <div className="tx-left">
                <div
                  className="tx-icon"
                  style={{
                    background: t.is_transfer
                      ? 'var(--bg)'
                      : t.group_color_hex
                      ? `${t.group_color_hex}22`
                      : pos
                      ? 'var(--teal-soft)'
                      : 'var(--bg)',
                  }}
                >
                  {t.is_transfer ? '🔁' : t.group_icon || category?.icon || '📁'}
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
              <div className={`tx-val num ${t.is_transfer ? '' : pos ? 'pos' : 'neg'}`}>
                {fmt(pos ? t.amount : -t.amount, account?.currency)}
              </div>
            </div>
          );
        })}
        <LoadMoreButton
          shown={transactions.length}
          total={total}
          loading={txLoading}
          onClick={() => setPage((p) => p + 1)}
        />
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
          reloadFromStart();
        }}
        onDeleted={() => {
          setEditingTx(null);
          reloadFromStart();
        }}
      />
    </div>
  );
}
