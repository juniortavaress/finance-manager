import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { creditCardsApi } from '../api/resources';
import { fmt, monthLabel } from '../utils/format';
import BankConfigModal from '../components/modals/BankConfigModal';
import PayInvoiceModal from '../components/modals/PayInvoiceModal';
import { IconPencil } from '../components/icons';

const FALLBACK_COLOR = '#0F5C5C';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function Accounts() {
  const { banks, accounts, reloadAll } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [payingCard, setPayingCard] = useState(null);
  const [highlightedCardId, setHighlightedCardId] = useState(null);

  const creditCardAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit_card' && a.credit_card), [accounts]);

  function openNewBank() {
    setEditingBank(null);
    setModalOpen(true);
  }

  function openEditBank(bank) {
    setEditingBank(bank);
    setModalOpen(true);
  }

  const [invoicesByCard, setInvoicesByCard] = useState({});
  const [invoiceIndexByCard, setInvoiceIndexByCard] = useState({});
  useEffect(() => {
    if (creditCardAccounts.length === 0) {
      setInvoicesByCard({});
      return;
    }
    let cancelled = false;
    Promise.all(creditCardAccounts.map((a) => creditCardsApi.invoices(a.credit_card.id))).then((results) => {
      if (cancelled) return;
      const map = {};
      creditCardAccounts.forEach((a, idx) => {
        map[a.credit_card.id] = results[idx]?.invoices || [];
      });
      setInvoicesByCard(map);
      setInvoiceIndexByCard((prev) => {
        const next = { ...prev };
        creditCardAccounts.forEach((a) => {
          const cardId = a.credit_card.id;
          if (next[cardId] === undefined) {
            // invoices vem ordenado do mais recente pro mais antigo; comeca na mais recente com saldo, senao a mais recente
            const invoices = map[cardId] || [];
            const outstandingIdx = invoices.findIndex((inv) => inv.outstanding_amount > 0);
            next[cardId] = outstandingIdx >= 0 ? outstandingIdx : 0;
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

  function toggleHighlight(cardId) {
    setHighlightedCardId((prev) => (prev === cardId ? null : cardId));
  }

  function colorForAccount(account) {
    return banks.find((b) => b.id === account.bank_id)?.color_hex || FALLBACK_COLOR;
  }

  // Pivo: agrupa por mes, uma barra por cartao dentro de cada grupo. Grafico mostra so os ultimos 6 meses.
  const monthGroups = useMemo(() => {
    const months = new Set();
    Object.values(invoicesByCard).forEach((invoices) => {
      invoices.forEach((inv) => months.add(inv.reference_month));
    });
    const sortedMonths = [...months].sort().slice(-6);

    return sortedMonths.map((referenceMonth) => ({
      referenceMonth,
      bars: creditCardAccounts.map((account) => {
        const invoice = (invoicesByCard[account.credit_card.id] || []).find(
          (i) => i.reference_month === referenceMonth
        );
        return { account, invoice, amount: invoice?.total_amount || 0 };
      }),
    }));
  }, [creditCardAccounts, invoicesByCard]);

  const globalMax = Math.max(1, ...monthGroups.flatMap((g) => g.bars.map((b) => b.amount)));

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Contas &amp; Bancos</h1>
        <div className="period" onClick={openNewBank}>
          + novo banco
        </div>
      </div>

      {monthGroups.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3>Histórico de faturas por mês</h3>
          <div className="rd-chart" style={{ height: 150 }}>
            {monthGroups.map((group) => (
              <div className="rd-col" key={group.referenceMonth}>
                <div className="rd-bars">
                  {group.bars.map(({ account, amount }) => {
                    const cardId = account.credit_card.id;
                    const dimmed = highlightedCardId && highlightedCardId !== cardId;
                    return (
                      <div
                        key={cardId}
                        className="rd-bar"
                        style={{
                          height: `${Math.max((amount / globalMax) * 100, amount > 0 ? 3 : 0)}px`,
                          background: colorForAccount(account),
                          width: 12,
                          opacity: dimmed ? 0.3 : 1,
                          transition: 'opacity 0.15s ease',
                          cursor: 'pointer',
                        }}
                        title={`${account.name}: ${fmt(amount)}`}
                        onClick={() => toggleHighlight(cardId)}
                      />
                    );
                  })}
                </div>
                <div className="rd-month">{monthLabel(Number(group.referenceMonth.slice(5, 7)))}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            {creditCardAccounts.map((account) => (
              <div key={account.credit_card.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorForAccount(account), display: 'inline-block' }} />
                {account.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {banks.length === 0 && <div className="empty-state">Nenhum banco cadastrado ainda.</div>}

      {banks.map((bank) => {
        const bankAccounts = accounts.filter((a) => a.bank_id === bank.id);
        const checking = bankAccounts.find((a) => a.type === 'checking');
        const creditCard = bankAccounts.find((a) => a.type === 'credit_card');
        const investment = bankAccounts.find((a) => a.type === 'investment');
        const cardInvoices = creditCard?.credit_card ? invoicesByCard[creditCard.credit_card.id] || [] : [];
        const cardInvoiceIdx = creditCard?.credit_card ? invoiceIndexByCard[creditCard.credit_card.id] ?? 0 : 0;
        const viewedInvoice = creditCard?.credit_card ? selectedInvoice(creditCard.credit_card.id) : null;

        return (
          <div className="acct-block" key={bank.id}>
            <div className="acct-bank-head" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="chip" style={{ background: bank.color_hex }} />
                <span className="name">{bank.name}</span>
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
            <div className="acct-types">
              <div className="acct-type-card">
                <div className="t-label">Conta corrente</div>
                <div className="t-val num">{checking ? fmt(checking.balance) : '—'}</div>
                <div className="t-sub">disponível</div>
              </div>
              <div className="acct-type-card">
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
                      onClick={() => setPayingCard({ card: creditCard.credit_card, invoice: viewedInvoice, bankName: bank.name })}
                    >
                      Pagar fatura
                    </button>
                  )}
                </div>
                {creditCard?.credit_card && cardInvoices.length > 0 ? (
                  <>
                    <div className="t-val num">{fmt(viewedInvoice?.total_amount || 0)}</div>
                    <div className="t-sub">
                      {viewedInvoice.status === 'paid'
                        ? 'paga'
                        : viewedInvoice.outstanding_amount > 0
                        ? `${fmt(viewedInvoice.outstanding_amount)} em aberto`
                        : 'quitada'}{' '}
                      ·{' '}
                      {viewedInvoice.outstanding_amount > 0 && viewedInvoice.due_date < todayIso() ? (
                        <span style={{ color: 'var(--brick)', fontWeight: 600 }}>vencida</span>
                      ) : (
                        <>
                          fecha dia {creditCard.credit_card.closing_day} · vence dia {creditCard.credit_card.due_day}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t-val num">—</div>
                    <div className="t-sub">sem cartão</div>
                  </>
                )}
              </div>
              <div className="acct-type-card">
                <div className="t-label">Investimento</div>
                <div className="t-val num">{investment ? fmt(investment.balance) : '—'}</div>
                <div className="t-sub">saldo aplicado</div>
              </div>
            </div>
          </div>
        );
      })}

      <BankConfigModal
        open={modalOpen}
        bank={editingBank}
        creditCardAccount={editingBank ? accounts.find((a) => a.bank_id === editingBank.id && a.type === 'credit_card') : null}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reloadAll();
        }}
      />

      <PayInvoiceModal
        open={!!payingCard}
        card={payingCard?.card}
        invoice={payingCard?.invoice}
        bankName={payingCard?.bankName}
        onClose={() => setPayingCard(null)}
        onPaid={() => {
          setPayingCard(null);
          reloadAll();
        }}
      />
    </div>
  );
}
