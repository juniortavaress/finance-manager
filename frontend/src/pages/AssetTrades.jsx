import { useEffect, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconSearch, IconPencil, IconTrash } from '../components/icons';
import PickAssetModal from '../components/modals/PickAssetModal';
import NewAssetModal from '../components/modals/NewAssetModal';
import TradeAssetModal from '../components/modals/TradeAssetModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';
import LoadMoreButton from '../components/LoadMoreButton';
import Skeleton from '../components/Skeleton';

const PAGE_SIZE = 15;

function fmtDateShortYear(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${fmtDateShort(isoDate)} ${d.getFullYear()}`;
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
  const { banks, investmentAccounts, bankById, reloadAll } = useData();
  const [bankFilter, setBankFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [buyPage, setBuyPage] = useState(1);
  const [sellPage, setSellPage] = useState(1);

  const { data: assetsData, reload: reloadAssets } = useFetch((signal) => investmentsApi.listAssetsLight(signal), []);

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

  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [pickKind, setPickKind] = useState('buy');
  const [newAssetModalOpen, setNewAssetModalOpen] = useState(false);
  const [newAssetPreset, setNewAssetPreset] = useState({ investmentAccountId: '', name: '' });
  const [lastInvestmentAccountId, setLastInvestmentAccountId] = useState('');
  const [tradeState, setTradeState] = useState(null);
  const [editTrade, setEditTrade] = useState(null);
  const [deletingTrade, setDeletingTrade] = useState(null);

  const assets = assetsData?.assets || [];
  const purchases = purchasesAccumulated;
  const sales = salesAccumulated;

  function reload() {
    reloadAssets();
    reloadAll();
    if (buyPage === 1) reloadBuys();
    else setBuyPage(1);
    if (sellPage === 1) reloadSells();
    else setSellPage(1);
  }

  function openPick(kind) {
    setPickKind(kind);
    setPickModalOpen(true);
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
          <div className="period" onClick={() => openPick('sell')}>
            + nova venda
          </div>
          <div
            className="period"
            style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
            onClick={() => openPick('buy')}
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
              <div className="compra-unit">
                {t.quantity} × {fmt(t.unit_price, currencyFor(t.asset))}
              </div>
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
              <div className="compra-unit">
                {t.quantity} × {fmt(t.unit_price, currencyFor(t.asset))}
              </div>
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

      <PickAssetModal
        open={pickModalOpen}
        kind={pickKind}
        assets={assets}
        investmentAccounts={investmentAccounts}
        bankById={bankById}
        initialInvestmentAccountId={lastInvestmentAccountId}
        onClose={() => setPickModalOpen(false)}
        onPick={(asset, investmentAccountId) => {
          setPickModalOpen(false);
          setLastInvestmentAccountId(investmentAccountId);
          setTradeState({ asset, kind: pickKind });
        }}
        onNewAsset={(investmentAccountId, name) => {
          setPickModalOpen(false);
          setLastInvestmentAccountId(investmentAccountId);
          setNewAssetPreset({ investmentAccountId, name });
          setNewAssetModalOpen(true);
        }}
      />

      <NewAssetModal
        open={newAssetModalOpen}
        deferCreate
        banks={banks}
        investmentAccounts={investmentAccounts}
        presetInvestmentAccountId={newAssetPreset.investmentAccountId}
        presetName={newAssetPreset.name}
        onClose={() => setNewAssetModalOpen(false)}
        onDraftReady={(draft) => {
          setNewAssetModalOpen(false);
          setTradeState({ assetDraft: draft, kind: 'buy' });
        }}
      />

      <TradeAssetModal
        open={!!tradeState}
        asset={tradeState?.asset}
        assetDraft={tradeState?.assetDraft}
        kind={tradeState?.kind}
        accountBalance={
          tradeState?.asset || tradeState?.assetDraft ? accountBalanceFor(tradeState.asset || tradeState.assetDraft) : null
        }
        accountCurrency={
          tradeState?.asset || tradeState?.assetDraft ? currencyFor(tradeState.asset || tradeState.assetDraft) : undefined
        }
        onClose={() => setTradeState(null)}
        onBack={() => {
          setPickKind(tradeState.kind);
          if (tradeState.assetDraft) {
            setNewAssetPreset({ investmentAccountId: tradeState.assetDraft.investment_account_id, name: tradeState.assetDraft.name });
            setTradeState(null);
            setNewAssetModalOpen(true);
          } else {
            setTradeState(null);
            setPickModalOpen(true);
          }
        }}
        onSaved={() => {
          setTradeState(null);
          reload();
        }}
      />

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
