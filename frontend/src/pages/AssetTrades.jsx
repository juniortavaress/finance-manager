import { useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconPencil, IconTrash } from '../components/icons';
import PickAssetModal from '../components/modals/PickAssetModal';
import NewAssetModal from '../components/modals/NewAssetModal';
import TradeAssetModal from '../components/modals/TradeAssetModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 15;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function initials(text) {
  return (text || '?').slice(0, 2).toUpperCase();
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

export default function AssetTrades() {
  const { banks, investmentAccounts, bankById, reloadAll } = useData();
  const [bankFilter, setBankFilter] = useState('');
  const [buyPage, setBuyPage] = useState(1);
  const [sellPage, setSellPage] = useState(1);

  const { data: assetsData, reload: reloadAssets } = useFetch((signal) => investmentsApi.listAssets(false, signal), []);

  const { data: buyData, reload: reloadBuys } = useFetch(
    (signal) =>
      investmentsApi.listAssetTransactions(
        { type: 'buy', page: buyPage, page_size: PAGE_SIZE, bank_id: bankFilter || undefined },
        signal
      ),
    [buyPage, bankFilter]
  );
  const { data: sellData, reload: reloadSells } = useFetch(
    (signal) =>
      investmentsApi.listAssetTransactions(
        { type: 'sell', page: sellPage, page_size: PAGE_SIZE, bank_id: bankFilter || undefined },
        signal
      ),
    [sellPage, bankFilter]
  );

  const currentMonth = todayIso().slice(0, 7);
  const { data: monthBuysData } = useFetch(
    (signal) =>
      investmentsApi.listAssetTransactions(
        { type: 'buy', date_from: `${currentMonth}-01`, page_size: 100, bank_id: bankFilter || undefined },
        signal
      ),
    [currentMonth, bankFilter]
  );

  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [pickKind, setPickKind] = useState('buy');
  const [newAssetModalOpen, setNewAssetModalOpen] = useState(false);
  const [tradeState, setTradeState] = useState(null);
  const [editTrade, setEditTrade] = useState(null);
  const [deletingTrade, setDeletingTrade] = useState(null);

  const assets = assetsData?.assets || [];
  const purchases = buyData?.asset_transactions || [];
  const sales = sellData?.asset_transactions || [];

  function reload() {
    reloadAssets();
    reloadBuys();
    reloadSells();
    reloadAll();
  }

  const totalThisMonth = useMemo(
    () => (monthBuysData?.asset_transactions || []).reduce((s, t) => s + t.total_amount, 0),
    [monthBuysData]
  );

  function openPick(kind) {
    setPickKind(kind);
    setPickModalOpen(true);
  }

  function bankNameFor(assetSnapshot) {
    const account = investmentAccounts.find((a) => a.investment_account?.id === assetSnapshot.investment_account_id);
    const bank = account ? bankById(account.bank_id) : null;
    return bank?.name || '';
  }

  function accountBalanceFor(asset) {
    const account = investmentAccounts.find((a) => a.investment_account?.id === asset.investment_account_id);
    return account ? account.balance : null;
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
        <div style={{ display: 'flex', gap: 8 }}>
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

      <div className="card stat-card" style={{ '--stripe': '#0F5C5C', marginBottom: 20 }}>
        <div className="label">Total aportado este mês</div>
        <div className="value num">{fmt(totalThisMonth)}</div>
      </div>

      <div className="card">
        <h3>Histórico de compras</h3>
        {purchases.length === 0 && <div className="empty-state">Nenhuma compra registrada ainda.</div>}
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
                  {bankNameFor(t.asset)} · {fmtDateShort(t.date)}
                </div>
              </div>
            </div>
            <div className="compra-val">
              <div className="compra-total num">{fmt(t.total_amount)}</div>
              <div className="compra-unit">
                {t.quantity} × {fmt(t.unit_price)}
              </div>
            </div>
          </div>
        ))}
        <Pagination page={buyPage} pageSize={PAGE_SIZE} total={buyData?.total || 0} onPageChange={setBuyPage} />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Histórico de vendas</h3>
        {sales.length === 0 && <div className="empty-state">Nenhuma venda registrada ainda.</div>}
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
                  {bankNameFor(t.asset)} · {fmtDateShort(t.date)}
                </div>
              </div>
            </div>
            <div className="compra-val">
              <div className="compra-total num">{fmt(t.total_amount)}</div>
              <div className="compra-unit">
                {t.quantity} × {fmt(t.unit_price)}
              </div>
            </div>
          </div>
        ))}
        <Pagination page={sellPage} pageSize={PAGE_SIZE} total={sellData?.total || 0} onPageChange={setSellPage} />
      </div>

      <PickAssetModal
        open={pickModalOpen}
        kind={pickKind}
        assets={assets}
        investmentAccounts={investmentAccounts}
        bankById={bankById}
        onClose={() => setPickModalOpen(false)}
        onPick={(asset) => {
          setPickModalOpen(false);
          setTradeState({ asset, kind: pickKind });
        }}
        onNewAsset={() => {
          setPickModalOpen(false);
          setNewAssetModalOpen(true);
        }}
      />

      <NewAssetModal
        open={newAssetModalOpen}
        banks={banks}
        investmentAccounts={investmentAccounts}
        onClose={() => setNewAssetModalOpen(false)}
        onCreated={(asset) => {
          setNewAssetModalOpen(false);
          reloadAssets();
          setTradeState({
            asset: { ...asset, position: { quantity: 0, avg_unit_price: 0, invested_amount: 0, current_amount: null } },
            kind: 'buy',
          });
        }}
      />

      <TradeAssetModal
        open={!!tradeState}
        asset={tradeState?.asset}
        kind={tradeState?.kind}
        accountBalance={tradeState?.asset ? accountBalanceFor(tradeState.asset) : null}
        onClose={() => setTradeState(null)}
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
