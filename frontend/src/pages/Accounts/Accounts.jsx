import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { creditCardsApi, investmentsApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { useBanks } from '../../hooks/resources/useBanks';
import { useAccounts } from '../../hooks/resources/useAccounts';
import { checkingAccounts as filterChecking, sortBanks } from '../../utils/accounts';
import { fmt, monthLabel } from '../../utils/format';
import BankLogo from '../../components/BankLogo';
import BankConfigModal from './components/BankConfigModal';
import PayInvoiceModal from '../../components/modals/PayInvoiceModal';
import Skeleton from '../../components/Skeleton';
import { IconPencil } from '../../components/icons';
import { localIsoDate } from '../../utils/date';

function todayIso() {
  return localIsoDate();
}

export default function Accounts() {
  const { banks, initialLoading: banksLoading, reload: reloadBanks } = useBanks();
  const { accounts, initialLoading: accountsLoading, reload: reloadAccounts } = useAccounts();
  const loaded = !banksLoading && !accountsLoading;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [payingCard, setPayingCard] = useState(null);
  const navigate = useNavigate();

  const creditCardAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit_card' && a.credit_card), [accounts]);
  const investmentAccounts = useMemo(() => accounts.filter((a) => !!a.investment_account), [accounts]);
  const checkingAccountsList = useMemo(() => filterChecking(accounts), [accounts]);
  const { data: assetsData, loading: assetsLoading } = useFetch(
    (signal) => investmentsApi.listAssets(false, signal),
    [],
    { cacheKey: 'accounts.assets' }
  );
  const investedByAccountId = useMemo(() => {
    const map = {};
    (assetsData?.assets || []).forEach((asset) => {
      const account = investmentAccounts.find((a) => a.investment_account?.id === asset.investment_account_id);
      if (!account) return;
      const value = asset.position.current_amount != null ? asset.position.current_amount : asset.position.invested_amount;
      map[account.id] = (map[account.id] || 0) + value;
    });
    return map;
  }, [assetsData, investmentAccounts]);

  const sortedBanks = useMemo(() => sortBanks(banks, accounts), [banks, accounts]);

  function openNewBank() {
    setEditingBank(null);
    setModalOpen(true);
  }

  function openEditBank(bank) {
    setEditingBank(bank);
    setModalOpen(true);
  }

  const [invoicesByCard, setInvoicesByCard] = useState({});
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceIndexByCard, setInvoiceIndexByCard] = useState({});
  useEffect(() => {
    if (creditCardAccounts.length === 0) {
      setInvoicesByCard({});
      setInvoicesLoading(false);
      return;
    }
    let cancelled = false;
    setInvoicesLoading(true);
    Promise.all(creditCardAccounts.map((a) => creditCardsApi.invoices(a.credit_card.id))).then((results) => {
      if (cancelled) return;
      const map = {};
      creditCardAccounts.forEach((a, idx) => {
        map[a.credit_card.id] = results[idx]?.invoices || [];
      });
      setInvoicesByCard(map);
      setInvoicesLoading(false);
      setInvoiceIndexByCard((prev) => {
        const next = { ...prev };
        const currentMonthPrefix = todayIso().slice(0, 7);
        creditCardAccounts.forEach((a) => {
          const cardId = a.credit_card.id;
          if (next[cardId] === undefined) {
            // invoices vem ordenado do mais recente pro mais antigo.
            // Prioridade: mes atual do calendario; senao a mais recente com saldo; senao a mais recente disponivel.
            const invoices = map[cardId] || [];
            const currentMonthIdx = invoices.findIndex((inv) => inv.reference_month.slice(0, 7) === currentMonthPrefix);
            if (currentMonthIdx >= 0) {
              next[cardId] = currentMonthIdx;
            } else {
              const outstandingIdx = invoices.findIndex((inv) => inv.outstanding_amount > 0);
              next[cardId] = outstandingIdx >= 0 ? outstandingIdx : 0;
            }
          }
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [creditCardAccounts]);

  function shiftInvoice(cardId, delta) {
    setInvoiceIndexByCard((prev) => {
      const invoices = invoicesByCard[cardId] || [];
      const current = prev[cardId] ?? 0;
      const next = Math.min(Math.max(current + delta, 0), Math.max(invoices.length - 1, 0));
      return { ...prev, [cardId]: next };
    });
  }

  function selectedInvoice(cardId) {
    const invoices = invoicesByCard[cardId] || [];
    const idx = invoiceIndexByCard[cardId] ?? 0;
    return invoices[idx] || null;
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Contas &amp; Bancos</h1>
        <div className="period" onClick={openNewBank}>
          + novo banco
        </div>
      </div>

      {!loaded &&
        [0, 1].map((i) => (
          <div className="acct-block" key={i}>
            <div className="acct-bank-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Skeleton width={16} height={16} radius={4} />
                <Skeleton width={120} height={14} />
              </div>
            </div>
            <div className="acct-types">
              {[0, 1, 2].map((j) => (
                <div className="acct-type-card" key={j}>
                  <Skeleton width={90} height={11} style={{ marginBottom: 8 }} />
                  <Skeleton width={110} height={18} style={{ marginBottom: 6 }} />
                  <Skeleton width={70} height={11} />
                </div>
              ))}
            </div>
          </div>
        ))}

      {loaded && banks.length === 0 && <div className="empty-state">Nenhum banco cadastrado ainda.</div>}

      {loaded && sortedBanks.map((bank) => {
        const bankAccounts = accounts.filter((a) => a.bank_id === bank.id);
        const checking = bankAccounts.find((a) => a.type === 'checking');
        const creditCard = bankAccounts.find((a) => a.type === 'credit_card');
        const investment = bankAccounts.find((a) => !!a.investment_account);
        const cardInvoices = creditCard?.credit_card ? invoicesByCard[creditCard.credit_card.id] || [] : [];
        const cardInvoiceIdx = creditCard?.credit_card ? invoiceIndexByCard[creditCard.credit_card.id] ?? 0 : 0;
        const viewedInvoice = creditCard?.credit_card ? selectedInvoice(creditCard.credit_card.id) : null;
        const typeCount = [checking, creditCard, investment].filter(Boolean).length;

        return (
          <div className="acct-block" key={bank.id}>
            <div className="acct-bank-head" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BankLogo bank={bank} size={24} className="acct-logo" />
                <span className="name acct-bank-link" onClick={() => navigate(`/contas/${bank.id}`)}>
                  {bank.name}
                </span>
                {creditCard?.credit_card && cardInvoices.length > 0 && (
                  <div className="period" style={{ padding: '3px 8px', fontSize: 11.5 }}>
                    <button
                      onClick={() => shiftInvoice(creditCard.credit_card.id, 1)}
                      disabled={cardInvoiceIdx >= cardInvoices.length - 1}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: cardInvoiceIdx >= cardInvoices.length - 1 ? 'default' : 'pointer',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        opacity: cardInvoiceIdx >= cardInvoices.length - 1 ? 0.35 : 1,
                        padding: 0,
                      }}
                    >
                      ◀
                    </button>{' '}
                    {monthLabel(Number(viewedInvoice.reference_month.slice(5, 7)))} {viewedInvoice.reference_month.slice(0, 4)}{' '}
                    <button
                      onClick={() => shiftInvoice(creditCard.credit_card.id, -1)}
                      disabled={cardInvoiceIdx <= 0}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: cardInvoiceIdx <= 0 ? 'default' : 'pointer',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        opacity: cardInvoiceIdx <= 0 ? 0.35 : 1,
                        padding: 0,
                      }}
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
              <button
                title="Editar banco"
                onClick={() => openEditBank(bank)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink-faint)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg)';
                  e.currentTarget.style.color = 'var(--teal)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-faint)';
                }}
              >
                <IconPencil style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className={`acct-types n${typeCount}`}>
              {checking && (
              <div className="acct-type-card clickable" onClick={() => navigate(`/contas/${bank.id}?tab=extrato`)}>
                <div className="t-label">Conta corrente</div>
                <div className="t-val num">{fmt(checking.balance, checking.currency)}</div>
                <div className="t-sub">disponível</div>
              </div>
              )}
              {creditCard?.credit_card && (
              <div className="acct-type-card clickable" onClick={() => navigate(`/contas/${bank.id}?tab=cartao`)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div className="t-label">Cartão de crédito</div>
                  {viewedInvoice && viewedInvoice.outstanding_amount > 0 && (
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        borderRadius: 6,
                        background: 'var(--teal-soft)',
                        color: 'var(--teal)',
                        fontWeight: 700,
                        fontSize: 11.5,
                        padding: '4px 9px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPayingCard({ card: creditCard.credit_card, invoice: viewedInvoice, bankName: bank.name, bankId: bank.id });
                      }}
                    >
                      Pagar fatura
                    </button>
                  )}
                </div>
                {creditCard?.credit_card && invoicesLoading ? (
                  <>
                    <Skeleton width={90} height={17} style={{ marginBottom: 5 }} />
                    <Skeleton width={110} height={11} />
                  </>
                ) : creditCard?.credit_card && cardInvoices.length > 0 ? (
                  <>
                    <div className="t-val num">{fmt(viewedInvoice?.total_amount || 0, creditCard.currency)}</div>
                    <div className="t-sub">
                      {viewedInvoice.status === 'paid'
                        ? 'paga'
                        : viewedInvoice.outstanding_amount > 0
                        ? `${fmt(viewedInvoice.outstanding_amount, creditCard.currency)} em aberto`
                        : 'quitada'}{' '}
                      ·{' '}
                      {viewedInvoice.outstanding_amount > 0 && viewedInvoice.due_date < todayIso() ? (
                        <span style={{ color: 'var(--brick)', fontWeight: 600 }}>vencida</span>
                      ) : (
                        <>
                          fecha dia {Number(viewedInvoice.closing_date.slice(8, 10))} · vence dia{' '}
                          {Number(viewedInvoice.due_date.slice(8, 10))}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t-val num">—</div>
                    <div className="t-sub">sem faturas</div>
                  </>
                )}
              </div>
              )}
              {investment && (
              <div className="acct-type-card clickable" onClick={() => navigate(`/contas/${bank.id}?tab=inv`)}>
                <div className="t-label">Investimento</div>
                {assetsLoading ? (
                  <>
                    <Skeleton width={90} height={17} style={{ marginBottom: 5 }} />
                    <Skeleton width={110} height={11} />
                  </>
                ) : (
                  <>
                    <div className="t-val num">
                      {fmt(investment.balance + (investedByAccountId[investment.id] || 0), investment.currency)}
                    </div>
                    <div className="t-sub">
                      {investment.balance > 0
                        ? `${fmt(investment.balance, investment.currency)} não alocado`
                        : 'saldo aplicado'}
                    </div>
                  </>
                )}
              </div>
              )}
            </div>
          </div>
        );
      })}

      <BankConfigModal
        open={modalOpen}
        bank={editingBank}
        creditCardAccount={editingBank ? accounts.find((a) => a.bank_id === editingBank.id && a.type === 'credit_card') : null}
        checkingAccount={editingBank ? accounts.find((a) => a.bank_id === editingBank.id && a.type === 'checking') : null}
        investmentAccount={editingBank ? accounts.find((a) => a.bank_id === editingBank.id && !!a.investment_account) : null}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reloadBanks();
          reloadAccounts();
        }}
      />

      <PayInvoiceModal
        open={!!payingCard}
        card={payingCard?.card}
        invoice={payingCard?.invoice}
        bankName={payingCard?.bankName}
        bankId={payingCard?.bankId}
        checkingAccounts={checkingAccountsList}
        onClose={() => setPayingCard(null)}
        onPaid={() => {
          setPayingCard(null);
          reloadBanks();
          reloadAccounts();
        }}
      />

    </div>
  );
}
