import { useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, fmtDateShort } from '../utils/format';
import PickAssetModal from '../components/modals/PickAssetModal';
import NewAssetModal from '../components/modals/NewAssetModal';
import TradeAssetModal from '../components/modals/TradeAssetModal';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function initials(text) {
  return (text || '?').slice(0, 2).toUpperCase();
}

export default function AssetTrades() {
  const { data: assetsData, reload: reloadAssets } = useFetch(() => investmentsApi.listAssets(), []);
  const { data: tradesData, reload: reloadTrades } = useFetch(() => investmentsApi.listAssetTransactions(), []);
  const { banks, investmentAccounts, bankById, reloadAll } = useData();
  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [pickKind, setPickKind] = useState('buy');
  const [newAssetModalOpen, setNewAssetModalOpen] = useState(false);
  const [tradeState, setTradeState] = useState(null);

  const assets = assetsData?.assets || [];
  const trades = tradesData?.asset_transactions || [];

  function reload() {
    reloadAssets();
    reloadTrades();
    reloadAll();
  }

  const purchases = useMemo(() => trades.filter((t) => t.type === 'buy'), [trades]);
  const sales = useMemo(() => trades.filter((t) => t.type === 'sell'), [trades]);

  const totalThisMonth = useMemo(() => {
    const currentMonth = todayIso().slice(0, 7);
    return purchases
      .filter((t) => t.date.slice(0, 7) === currentMonth)
      .reduce((s, t) => s + t.total_amount, 0);
  }, [purchases]);

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

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Compras e vendas</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div
            className="period"
            style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
            onClick={() => openPick('buy')}
          >
            + nova compra
          </div>
          <div className="period" onClick={() => openPick('sell')}>
            + nova venda
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
                <div className="compra-desc">{t.asset.code || t.asset.name}</div>
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
                <div className="compra-desc">{t.asset.code || t.asset.name}</div>
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
    </div>
  );
}
