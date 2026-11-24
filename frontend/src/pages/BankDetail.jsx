import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { creditCardsApi, investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useBanks } from '../hooks/resources/useBanks';
import { useAccounts } from '../hooks/resources/useAccounts';
import { useCategories } from '../hooks/resources/useCategories';
import {
  checkingAccounts as filterChecking,
  creditCardAccounts as filterCreditCard,
  investmentAccounts as filterInvestment,
} from '../utils/accounts';
import { expenseCategories as filterExpense, incomeCategories as filterIncome } from '../utils/categories';
import { fmt, monthLabelFull } from '../utils/format';
import { localIsoDate } from '../utils/date';
import { notifyDataChanged } from '../utils/dataChanged';
import AssetTradeFlow from '../components/AssetTradeFlow';
import BankLogo from '../components/BankLogo';
import BankCardTab from '../components/bank/BankCardTab';
import BankInvestmentsTab from '../components/bank/BankInvestmentsTab';
import BankTransactionsTab from '../components/bank/BankTransactionsTab';
import PayInvoiceModal from '../components/modals/PayInvoiceModal';
import TransactionModal from '../components/modals/TransactionModal';
import TransferModal from '../components/modals/TransferModal';
import Skeleton from '../components/Skeleton';

const TAB_LABELS = { extrato: 'Conta corrente', cartao: 'Cartão · fatura', inv: 'Investimentos' };

function initialInvoiceIndex(invoices) {
  const today = localIsoDate();
  const closed = invoices.findIndex((inv) => inv.outstanding_amount > 0 && inv.closing_date < today);
  if (closed >= 0) return closed;
  const current = invoices.findIndex((inv) => inv.reference_month.slice(0, 7) === today.slice(0, 7));
  return current >= 0 ? current : 0;
}

export default function BankDetail() {
  const { bankId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { banks, initialLoading: banksLoading } = useBanks();
  const { accounts, initialLoading: accountsLoading, reload: reloadAccounts } = useAccounts();
  const { categories } = useCategories();

  const bank = banks.find((b) => b.id === bankId);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.bank_id === bankId), [accounts, bankId]);
  const checking = bankAccounts.find((a) => a.type === 'checking');
  const creditCard = bankAccounts.find((a) => a.type === 'credit_card');
  const investment = bankAccounts.find((a) => !!a.investment_account);

  const tabs = [checking && 'extrato', creditCard && 'cartao', investment && 'inv'].filter(Boolean);
  const requestedTab = searchParams.get('tab');
  const tab = tabs.includes(requestedTab) ? requestedTab : tabs[0];

  const [invoiceIndex, setInvoiceIndex] = useState(null);
  const [month, setMonth] = useState(() => localIsoDate().slice(0, 7));
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingTx, setEditingTx] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [tradeKind, setTradeKind] = useState(null);

  const cardId = creditCard?.credit_card?.id;
  const { data: invoiceData, loading: invoicesLoading, reload: reloadInvoices } = useFetch(
    () => (cardId ? creditCardsApi.invoices(cardId) : Promise.resolve({ invoices: [] })),
    [cardId],
    { cacheKey: 'bank.invoices' }
  );
  const invoices = invoiceData?.invoices || [];
  const { data: assetsData, loading: assetsLoading, reload: reloadAssets } = useFetch(
    (signal) => investmentsApi.listAssets(false, signal),
    [],
    { cacheKey: 'accounts.assets' }
  );

  useEffect(() => {
    setInvoiceIndex(null);
  }, [bankId]);

  const selectedIndex = invoiceIndex ?? initialInvoiceIndex(invoices);
  const invoice = invoices[selectedIndex] || null;

  const bankAssets = useMemo(
    () => (assetsData?.assets || []).filter((a) => a.investment_account_id === investment?.investment_account?.id),
    [assetsData, investment]
  );
  const investedTotal = bankAssets.reduce(
    (sum, a) => sum + (a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount),
    0
  );

  const checkingList = useMemo(() => filterChecking(accounts), [accounts]);
  const creditCardList = useMemo(() => filterCreditCard(accounts), [accounts]);
  const investmentList = useMemo(() => filterInvestment(accounts), [accounts]);
  const expenseCategories = useMemo(() => filterExpense(categories), [categories]);
  const incomeCategories = useMemo(() => filterIncome(categories), [categories]);

  if (!banksLoading && !accountsLoading && !bank) return <Navigate to="/contas" replace />;
  if (!bank || !tab) {
    return (
      <div className="screen active">
        <Skeleton width={220} height={32} style={{ marginBottom: 24 }} />
        <Skeleton width="100%" height={92} radius={10} />
      </div>
    );
  }

  function selectTab(next) {
    setSearchParams({ tab: next }, { replace: true });
  }

  function refreshAll() {
    setRefreshKey((k) => k + 1);
    reloadAccounts();
    reloadInvoices();
    reloadAssets();
    notifyDataChanged();
  }

  const patrimony = (checking?.balance || 0) + (investment?.balance || 0) + investedTotal;
  const currency = (checking || creditCard || investment).currency;
  const dueLabel = invoice ? `vence ${fmtDay(invoice.due_date)}` : 'sem faturas';

  return (
    <div className="screen active">
      <div className="topbar">
        <div className="bank-title">
          <BankLogo bank={bank} />
          <div>
            <h1>{bank.name}</h1>
            <div className="bank-sub">
              Patrimônio neste banco <b className="num">{fmt(patrimony, currency)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className={`bank-stats n${tabs.length}`}>
        {checking && (
          <button type="button" className="bank-stat" onClick={() => selectTab('extrato')}>
            <div className="bank-stat-label">Conta corrente</div>
            <div className="bank-stat-value num">{fmt(checking.balance, checking.currency)}</div>
            <div className="bank-stat-sub">disponível</div>
          </button>
        )}
        {creditCard && (
          <div className="bank-stat card-stat" role="button" tabIndex={0} onClick={() => selectTab('cartao')}>
            <div className="bank-stat-label">
              Cartão de crédito
              {invoice && invoice.outstanding_amount > 0 && invoice.closing_date < localIsoDate() && (
                <span
                  className="bank-stat-action"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPayingInvoice(true);
                  }}
                >
                  Pagar fatura
                </span>
              )}
            </div>
            <div className="bank-stat-value num">
              {invoicesLoading && !invoice ? '—' : fmt(invoice?.total_amount || 0, creditCard.currency)}
            </div>
            <div className="bank-stat-sub">{dueLabel}</div>
          </div>
        )}
        {investment && (
          <button type="button" className="bank-stat inv-stat" onClick={() => selectTab('inv')}>
            <div className="bank-stat-label">Investido</div>
            <div className="bank-stat-value num">{fmt(investment.balance + investedTotal, investment.currency)}</div>
            <div className="bank-stat-sub">{fmt(investment.balance, investment.currency)} em caixa para investir</div>
          </button>
        )}
      </div>

      <div className="bank-tabs">
        {tabs.map((key) => (
          <button key={key} type="button" className={`bank-tab${tab === key ? ' active' : ''}`} onClick={() => selectTab(key)}>
            {TAB_LABELS[key]}
          </button>
        ))}
        {tab === 'extrato' && (
          <div className="bank-tab-extra period-nav">
            <button type="button" className="period-nav-btn" onClick={() => setMonth(shiftMonth(month, -1))}>
              ◀
            </button>
            <span>
              {monthLabelFull(Number(month.slice(5, 7)))} {month.slice(0, 4)}
            </span>
            <button type="button" className="period-nav-btn" onClick={() => setMonth(shiftMonth(month, 1))}>
              ▶
            </button>
          </div>
        )}
        {tab === 'cartao' && invoices.length > 0 && (
          <div className="bank-tab-extra period-nav">
            <button
              type="button"
              className="period-nav-btn"
              disabled={selectedIndex >= invoices.length - 1}
              onClick={() => setInvoiceIndex(selectedIndex + 1)}
            >
              ◀
            </button>
            <span>
              {monthLabelFull(Number(invoice.reference_month.slice(5, 7)))} {invoice.reference_month.slice(0, 4)}
            </span>
            <button
              type="button"
              className="period-nav-btn"
              disabled={selectedIndex <= 0}
              onClick={() => setInvoiceIndex(selectedIndex - 1)}
            >
              ▶
            </button>
          </div>
        )}
        {tab === 'inv' && (
          <div className="bank-tab-extra">
            <button type="button" className="bank-tab-action" onClick={() => setTransferOpen(true)}>
              Transferir
            </button>
            <button type="button" className="bank-tab-action" onClick={() => setTradeKind('buy')}>
              Comprar
            </button>
            <button type="button" className="bank-tab-action" onClick={() => setTradeKind('sell')}>
              Vender
            </button>
          </div>
        )}
      </div>

      {tab === 'extrato' && (
        <BankTransactionsTab
          account={checking}
          categories={categories}
          month={month}
          isCurrentMonth={month === localIsoDate().slice(0, 7)}
          refreshKey={refreshKey}
          onEdit={setEditingTx}
        />
      )}
      {tab === 'cartao' && (
        <BankCardTab
          cardId={cardId}
          invoice={invoice}
          currency={creditCard.currency}
          refreshKey={refreshKey}
          onEdit={setEditingTx}
        />
      )}
      {tab === 'inv' && <BankInvestmentsTab account={investment} assets={bankAssets} loading={assetsLoading} />}

      <TransactionModal
        open={!!editingTx}
        transaction={editingTx}
        checkingAccounts={checkingList}
        creditCardAccounts={creditCardList}
        investmentAccounts={investmentList}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        onClose={() => setEditingTx(null)}
        onCreated={() => {
          setEditingTx(null);
          refreshAll();
        }}
        onDeleted={() => {
          setEditingTx(null);
          refreshAll();
        }}
      />

      <PayInvoiceModal
        open={payingInvoice}
        card={creditCard?.credit_card}
        invoice={invoice}
        bankName={bank.name}
        bankId={bank.id}
        checkingAccounts={checkingList}
        onClose={() => setPayingInvoice(false)}
        onPaid={() => {
          setPayingInvoice(false);
          refreshAll();
        }}
      />

      <TransferModal
        open={transferOpen}
        checkingAccounts={checkingList}
        investmentAccounts={investmentList}
        onClose={() => setTransferOpen(false)}
        onCreated={() => {
          setTransferOpen(false);
          refreshAll();
        }}
      />

      <AssetTradeFlow
        kind={tradeKind}
        initialInvestmentAccountId={investment?.investment_account?.id || ''}
        onClose={() => setTradeKind(null)}
        onSaved={refreshAll}
      />
    </div>
  );
}

function shiftMonth(ym, delta) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDay(isoDate) {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}
