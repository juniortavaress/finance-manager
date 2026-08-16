import { useEffect, useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { fmt } from '../utils/format';
import { maskToNumber, numberToMasked } from '../utils/currency';
import { IconSearch, IconPencil } from '../components/icons';
import CurrencyInput from '../components/CurrencyInput';
import NewAssetModal from '../components/modals/NewAssetModal';

const TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acoes: 'Ações',
  fii: 'FII',
  fundos: 'Fundos',
  cripto: 'Cripto',
  outro: 'Outro',
};
const TYPE_COLORS = {
  renda_fixa: '#0F5C5C',
  acoes: '#C0912F',
  fii: '#3D7A8C',
  fundos: '#7A4FE0',
  cripto: '#A6432C',
  outro: '#8B9A97',
};

const COLUMNS = [
  { key: 'name', label: 'Ativo' },
  { key: 'type', label: 'Tipo' },
  { key: 'bank', label: 'Corretora' },
  { key: 'quantity', label: 'Qtd.' },
  { key: 'avg_unit_price', label: 'Preço médio' },
  { key: 'current_unit_price', label: 'Preço atual' },
  { key: 'invested_amount', label: 'Investido' },
  { key: 'current_amount', label: 'Atual' },
  { key: 'dividends_total', label: 'Dividendos' },
  { key: 'rent', label: 'Rent.' },
];

export default function Portfolio() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: assetsData, reload: reloadAssets } = useFetch(
    () => investmentsApi.listAssets(showArchived),
    [showArchived]
  );
  const { data: archivedData, reload: reloadArchivedCheck } = useFetch(() => investmentsApi.listAssets(true), []);
  const { banks, investmentAccounts, bankById, reloadAll } = useData();
  const { showSuccess, showError } = useToast();

  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState({ key: 'current_amount', dir: 'desc' });

  const [editingAsset, setEditingAsset] = useState(null);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const assets = assetsData?.assets || [];
  const hasArchived = (archivedData?.assets || []).length > 0;

  useEffect(() => {
    setSearch('');
    setBankFilter('');
    setTypeFilter('');
  }, [showArchived]);

  useEffect(() => {
    if (!hasArchived && showArchived) setShowArchived(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasArchived]);

  function reload() {
    reloadAssets();
    reloadArchivedCheck();
    reloadAll();
  }

  function bankFor(asset) {
    const account = investmentAccounts.find((a) => a.investment_account?.id === asset.investment_account_id);
    return account ? bankById(account.bank_id) : null;
  }

  const enriched = useMemo(() => {
    return assets.map((a) => {
      const bank = bankFor(a);
      return {
        ...a,
        bankName: bank?.name || '',
        bankColor: bank?.color_hex || '#8B9A97',
        rent: a.position.total_return_pct,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, investmentAccounts, banks]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enriched.filter((a) => {
      if (term && !(a.code || '').toLowerCase().includes(term) && !a.name.toLowerCase().includes(term)) return false;
      if (bankFilter && a.bankName !== bankFilter) return false;
      if (typeFilter && a.type !== typeFilter) return false;
      return true;
    });
  }, [enriched, search, bankFilter, typeFilter]);

  const sorted = useMemo(() => {
    const sortValue = {
      name: (a) => (a.code || a.name).toLowerCase(),
      type: (a) => a.type,
      bank: (a) => a.bankName.toLowerCase(),
      quantity: (a) => a.position.quantity,
      avg_unit_price: (a) => a.position.avg_unit_price,
      current_unit_price: (a) => a.current_unit_price ?? -Infinity,
      invested_amount: (a) => a.position.invested_amount,
      current_amount: (a) => a.position.current_amount ?? a.position.invested_amount,
      dividends_total: (a) => a.position.dividends_total,
      rent: (a) => (a.rent != null ? a.rent : -Infinity),
    }[sort.key];

    return [...filtered].sort((x, y) => {
      const vx = sortValue(x);
      const vy = sortValue(y);
      if (vx < vy) return sort.dir === 'asc' ? -1 : 1;
      if (vx > vy) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sort]);

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }

  function clearFilters() {
    setSearch('');
    setBankFilter('');
    setTypeFilter('');
  }

  const bankOptions = useMemo(() => [...new Set(enriched.map((a) => a.bankName).filter(Boolean))], [enriched]);
  const typeOptions = useMemo(() => [...new Set(enriched.map((a) => a.type))], [enriched]);

  function startEditPrice(asset) {
    setEditingPriceId(asset.id);
    setEditingPriceValue(asset.current_unit_price != null ? numberToMasked(asset.current_unit_price) : '');
  }

  function cancelEditPrice() {
    setEditingPriceId(null);
    setEditingPriceValue('');
  }

  async function saveEditPrice(assetId) {
    const value = maskToNumber(editingPriceValue);
    setSavingPrice(true);
    try {
      await investmentsApi.updateAsset(assetId, { current_unit_price: value > 0 ? value : null });
      showSuccess('Preço atualizado com sucesso.');
      setEditingPriceId(null);
      setEditingPriceValue('');
      reload();
    } catch (err) {
      showError(err.message || 'Não foi possível atualizar o preço.');
    } finally {
      setSavingPrice(false);
    }
  }

  const hasActiveFilters = !!(search || bankFilter || typeFilter);

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Carteira</h1>
      </div>

      <div className="fatura-note show" style={{ marginBottom: 16 }}>
        Clique no preço atual de um ativo para atualizá-lo manualmente — em breve integração automática via API de
        cotações.
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 6 }}>
        <div className="filter-bar">
          <div className="filter-search">
            <IconSearch />
            <input
              type="text"
              placeholder="Buscar ativo ou ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-select">
            <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
              <option value="">Todas as corretoras</option>
              {bankOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-select">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Todos os tipos</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type] || type}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="filter-clear"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{ opacity: hasActiveFilters ? 1 : 0.4, cursor: hasActiveFilters ? 'pointer' : 'default' }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {hasArchived && (
        <div className="seg" style={{ marginBottom: 16, maxWidth: 280 }}>
          <div className={`seg-opt${!showArchived ? ' active' : ''}`} onClick={() => setShowArchived(false)}>
            Ativos
          </div>
          <div className={`seg-opt${showArchived ? ' active' : ''}`} onClick={() => setShowArchived(true)}>
            Arquivados
          </div>
        </div>
      )}

      <div className="card">
        <div className="asset-table-wrap">
          <div className="asset-row asset-head">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={`a-sortable${sort.key === c.key ? ' sorted' : ''}`}
                onClick={() => toggleSort(c.key)}
              >
                {c.label}
                <span className="arrow">{sort.key === c.key && sort.dir === 'asc' ? '▴' : '▾'}</span>
              </div>
            ))}
            <div />
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: '20px 4px', fontSize: 12.5, color: 'var(--ink-faint)' }}>
              {showArchived ? 'Nenhum ativo arquivado.' : 'Nenhum ativo encontrado com esses filtros.'}
            </div>
          )}

          {sorted.map((a) => {
            const color = TYPE_COLORS[a.type] || '#8B9A97';
            const currentAmount = a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount;
            return (
              <div className="asset-row" key={a.id}>
                <div>
                  <div className="a-name">{a.code || a.name}</div>
                  <div className="a-sub">{a.name}</div>
                </div>
                <div>
                  <span className="tipo-tag" style={{ background: `${color}22`, color }}>
                    <span className="dot" style={{ background: color }} />
                    {TYPE_LABELS[a.type] || a.type}
                  </span>
                </div>
                <div className="bank-chip-mini">
                  <span className="dot" style={{ background: a.bankColor }} />
                  {a.bankName}
                </div>
                <div className="a-num">{a.position.quantity}</div>
                <div className="a-num">{fmt(a.position.avg_unit_price)}</div>
                {editingPriceId === a.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <CurrencyInput
                      autoFocus
                      value={editingPriceValue}
                      onChange={setEditingPriceValue}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditPrice(a.id);
                        if (e.key === 'Escape') cancelEditPrice();
                      }}
                      onBlur={() => saveEditPrice(a.id)}
                      disabled={savingPrice}
                      style={{ width: '100%', padding: '4px 6px', fontSize: 12.5 }}
                    />
                  </div>
                ) : (
                  <div
                    className="a-num"
                    title="Clique para editar"
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                    onClick={() => startEditPrice(a)}
                  >
                    {a.current_unit_price != null ? fmt(a.current_unit_price) : '—'}
                  </div>
                )}
                <div className="a-num">{fmt(a.position.invested_amount)}</div>
                <div className="a-num">{fmt(currentAmount)}</div>
                <div className="a-num" style={{ color: a.position.dividends_total > 0 ? 'var(--gold)' : undefined }}>
                  {fmt(a.position.dividends_total)}
                </div>
                <div className={`a-rent ${a.rent == null ? '' : a.rent >= 0 ? 'up' : 'down'}`}>
                  {a.rent == null ? '—' : `${a.rent >= 0 ? '+' : ''}${a.rent.toFixed(1)}%`}
                </div>
                <button
                  type="button"
                  title="Editar ativo"
                  onClick={() => setEditingAsset(a)}
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
                >
                  <IconPencil style={{ width: 13, height: 13 }} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <NewAssetModal
        open={!!editingAsset}
        asset={editingAsset}
        banks={banks}
        investmentAccounts={investmentAccounts}
        onClose={() => setEditingAsset(null)}
        onSaved={() => {
          setEditingAsset(null);
          reload();
        }}
      />
    </div>
  );
}
