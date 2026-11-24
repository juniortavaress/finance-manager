import { useCallback, useEffect, useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useBanks } from '../hooks/resources/useBanks';
import { useAccounts } from '../hooks/resources/useAccounts';
import { investmentAccounts as filterInvestment } from '../utils/accounts';
import { fmt, fmtDateShort } from '../utils/format';
import { fixedIncomeRateLabel, isValueBasedFixedIncome } from '../utils/fixedIncome';
import { IconSearch, IconPencil, IconTrash } from '../components/icons';
import AssetTradeFlow from '../components/AssetTradeFlow';
import TradeAssetModal from '../components/modals/TradeAssetModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';
import LoadMoreButton from '../components/LoadMoreButton';
import Skeleton from '../components/Skeleton';

const PAGE_SIZE = 15;

function fmtDateShortYear(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${fmtDateShort(isoDate)} ${d.getFullYear()}`;
}

// Linha de detalhe de uma operacao: quantidade x preco unitario, ou - na renda
// fixa lancada so' por valor - a taxa do aporte / o rendimento do resgate.
function tradeDetail(t, currency) {
  if (!isValueBasedFixedIncome(t.asset)) return `${t.quantity} × ${fmt(t.unit_price, currency)}`;
  if (t.type === 'buy') return fixedIncomeRateLabel(t.asset, t.fixed_income_rate_pct);
  const parts = [];
  if (t.realized) parts.push(`rendimento ${t.realized.gross_profit >= 0 ? '+' : ''}${fmt(t.realized.gross_profit, currency)}`);
  if (t.fee_amount > 0) parts.push(`imposto ${fmt(t.fee_amount, currency)}`);
  return parts.join(' · ');
}

function initials(text) {
  return (text || '?').slice(0, 2).toUpperCase();
}

function mergeById(existing, incoming) {
  const seen = new Set(existing.map((t) => t.id));
  const deduped = incoming.filter((t) => !seen.has(t.id));
  return [...existing, ...deduped];
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
        width: 24,
        height: 24,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-faint)',
        cursor: 'pointer',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
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

export default function AssetTrades() {
  const { banks, reload: reloadBanks } = useBanks();
  const { accounts, reload: reloadAccounts } = useAccounts();
  const bankById = useCallback((id) => banks.find((b) => b.id === id), [banks]);
  const investmentAccounts = useMemo(() => filterInvestment(accounts), [accounts]);
  const [bankFilter, setBankFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [buyPage, setBuyPage] = useState(1);
  const [sellPage, setSellPage] = useState(1);

  const { reload: reloadAssets } = useFetch((signal) => investmentsApi.listAssetsLight(signal), []);

  const [purchasesAccumulated, setPurchasesAccumulated] = useState([]);
  const [salesAccumulated, setSalesAccumulated] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setBuyPage(1);
    setSellPage(1);
  }, [debouncedSearch, bankFilter]);

  const { data: buyData, reload: reloadBuys, loading: buyLoading } = useFetch(
    (signal) =>
      investmentsApi.listAssetTransactions(
        {
          type: 'buy',
          page: buyPage,
          page_size: PAGE_SIZE,
          bank_id: bankFilter || undefined,
          search: debouncedSearch || undefined,
        },
        signal
      ),
    [buyPage, bankFilter, debouncedSearch]
  );
  const { data: sellData, reload: reloadSells, loading: sellLoading } = useFetch(
    (signal) =>
      investmentsApi.listAssetTransactions(
        {
          type: 'sell',
          page: sellPage,
          page_size: PAGE_SIZE,
          bank_id: bankFilter || undefined,
          search: debouncedSearch || undefined,
        },
        signal
      ),
    [sellPage, bankFilter, debouncedSearch]
  );

  useEffect(() => {
    if (!buyData) return;
    setPurchasesAccumulated((prev) => mergeById(buyPage === 1 ? [] : prev, buyData.asset_transactions));
  }, [buyData, buyPage]);

  useEffect(() => {
    if (!sellData) return;
    setSalesAccumulated((prev) => mergeById(sellPage === 1 ? [] : prev, sellData.asset_transactions));
  }, [sellData, sellPage]);

  const [flowKind, setFlowKind] = useState(null);
  const [editTrade, setEditTrade] = useState(null);
  const [deletingTrade, setDeletingTrade] = useState(null);

  const purchases = purchasesAccumulated;
  const sales = salesAccumulated;

  function reload() {
    reloadAssets();
    reloadBanks();
    reloadAccounts();
    if (buyPage === 1) reloadBuys();
    else setBuyPage(1);
    if (sellPage === 1) reloadSells();
    else setSellPage(1);
  }

  function accountFor(assetSnapshot) {
    return investmentAccounts.find((a) => a.investment_account?.id === assetSnapshot.investment_account_id) || null;
  }

  function bankNameFor(assetSnapshot) {
    const account = accountFor(assetSnapshot);
    const bank = account ? bankById(account.bank_id) : null;
    return bank?.name || '';
  }

  function accountBalanceFor(asset) {
    const account = accountFor(asset);
    return account ? account.balance : null;
  }

  function currencyFor(assetSnapshot) {
    return accountFor(assetSnapshot)?.currency || 'BRL';
  }

  function handleBankFilterChange(value) {
    setBankFilter(value);
    setBuyPage(1);
    setSellPage(1);
  }

  async function handleDeleteTrade() {
    await investmentsApi.removeAssetTransaction(deletingTrade.id);
    setDeletingTrade(null);
    reload();
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Compras e vendas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="period" onClick={() => setFlowKind('sell')}>
            + nova venda
          </div>
          <div
            className="period"
            style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
            onClick={() => setFlowKind('buy')}
          >
            + nova compra
          </div>
        </div>
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
            <select value={bankFilter} onChange={(e) => handleBankFilterChange(e.target.value)}>
              <option value="">Todas as corretoras</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Histórico de compras</h3>
        {buyLoading &&
          purchases.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <div className="compra-row" key={i}>
              <div className="compra-left">
                <Skeleton width={34} height={34} radius={9} />
                <div>
                  <Skeleton width={90} height={13} style={{ marginBottom: 5 }} />
                  <Skeleton width={140} height={11} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Skeleton width={80} height={14} style={{ marginBottom: 5 }} />
                <Skeleton width={100} height={11} />
              </div>
            </div>
          ))}
        {!buyLoading && purchases.length === 0 && <div className="empty-state">Nenhuma compra registrada ainda.</div>}
        {purchases.map((t) => (
          <div className="compra-row" key={t.id}>
            <div className="compra-left">
              <div className="compra-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                {initials(t.asset.code || t.asset.name)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="compra-desc">{t.asset.code || t.asset.name}</div>
                  <RowActionButton title="Editar compra" onClick={() => setEditTrade(t)}>
                    <IconPencil style={{ width: 13, height: 13 }} />
                  </RowActionButton>
                  <RowActionButton title="Excluir compra" color="var(--brick)" onClick={() => setDeletingTrade(t)}>
                    <IconTrash style={{ width: 13, height: 13 }} />
                  </RowActionButton>
                </div>
                <div className="compra-meta">
                  {bankNameFor(t.asset)} · {fmtDateShortYear(t.date)}
                </div>
              </div>
            </div>
            <div className="compra-val">
              <div className="compra-total num">{fmt(t.total_amount, currencyFor(t.asset))}</div>
              <div className="compra-unit">{tradeDetail(t, currencyFor(t.asset))}</div>
            </div>
          </div>
        ))}
        <LoadMoreButton
          shown={purchases.length}
          total={buyData?.total || 0}
          loading={buyLoading}
          onClick={() => setBuyPage((p) => p + 1)}
        />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Histórico de vendas</h3>
        {sellLoading &&
          sales.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <div className="compra-row" key={i}>
              <div className="compra-left">
                <Skeleton width={34} height={34} radius={9} />
                <div>
                  <Skeleton width={90} height={13} style={{ marginBottom: 5 }} />
                  <Skeleton width={140} height={11} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Skeleton width={80} height={14} style={{ marginBottom: 5 }} />
                <Skeleton width={100} height={11} />
              </div>
            </div>
          ))}
        {!sellLoading && sales.length === 0 && <div className="empty-state">Nenhuma venda registrada ainda.</div>}
        {sales.map((t) => (
          <div className="compra-row" key={t.id}>
            <div className="compra-left">
              <div className="compra-icon" style={{ background: 'var(--brick-soft)', color: 'var(--brick)' }}>
                {initials(t.asset.code || t.asset.name)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="compra-desc">{t.asset.code || t.asset.name}</div>
                  <RowActionButton title="Editar venda" onClick={() => setEditTrade(t)}>
                    <IconPencil style={{ width: 13, height: 13 }} />
                  </RowActionButton>
                  <RowActionButton title="Excluir venda" color="var(--brick)" onClick={() => setDeletingTrade(t)}>
                    <IconTrash style={{ width: 13, height: 13 }} />
                  </RowActionButton>
                </div>
                <div className="compra-meta">
                  {bankNameFor(t.asset)} · {fmtDateShortYear(t.date)}
                </div>
              </div>
            </div>
            <div className="compra-val">
              <div className="compra-total num">{fmt(t.total_amount, currencyFor(t.asset))}</div>
              <div className="compra-unit">{tradeDetail(t, currencyFor(t.asset))}</div>
            </div>
          </div>
        ))}
        <LoadMoreButton
          shown={sales.length}
          total={sellData?.total || 0}
          loading={sellLoading}
          onClick={() => setSellPage((p) => p + 1)}
        />
      </div>

      <AssetTradeFlow kind={flowKind} onClose={() => setFlowKind(null)} onSaved={reload} />

      <TradeAssetModal
        open={!!editTrade}
        asset={editTrade?.asset}
        trade={editTrade}
        accountBalance={editTrade?.asset ? accountBalanceFor(editTrade.asset) : null}
        accountCurrency={editTrade?.asset ? currencyFor(editTrade.asset) : undefined}
        onClose={() => setEditTrade(null)}
        onSaved={() => {
          setEditTrade(null);
          reload();
        }}
        onDelete={() => {
          setDeletingTrade(editTrade);
          setEditTrade(null);
        }}
      />

      <ConfirmDeleteModal
        open={!!deletingTrade}
        onClose={() => setDeletingTrade(null)}
        onConfirm={handleDeleteTrade}
        title={deletingTrade?.type === 'sell' ? 'Excluir venda' : 'Excluir compra'}
        message="Tem certeza que deseja excluir esta operação? Isso vai reverter o saldo da conta e recalcular a posição do ativo. Esta ação não pode ser desfeita."
      />
    </div>
  );
}
