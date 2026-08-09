import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { creditCardsApi } from '../api/resources';
import { fmt, monthLabel } from '../utils/format';
import BankConfigModal from '../components/modals/BankConfigModal';
import PayInvoiceModal from '../components/modals/PayInvoiceModal';
import { IconPencil } from '../components/icons';

const FALLBACK_COLOR = '#0F5C5C';

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
  useEffect(() => {
    if (creditCardAccounts.length === 0) {
      setInvoicesByCard({});
      return;
    }
    let cancelled = false;
    Promise.all(creditCardAccounts.map((a) => creditCardsApi.invoices(a.credit_card.id, 6))).then((results) => {
      if (cancelled) return;
      const map = {};
      creditCardAccounts.forEach((a, idx) => {
        map[a.credit_card.id] = results[idx]?.invoices || [];
      });
      setInvoicesByCard(map);
    });
    return () => {
      cancelled = true;
    };
  }, [creditCardAccounts]);

  function toggleHighlight(cardId) {
    setHighlightedCardId((prev) => (prev === cardId ? null : cardId));
  }

  function colorForAccount(account) {
    return banks.find((b) => b.id === account.bank_id)?.color_hex || FALLBACK_COLOR;
  }

  function latestOutstandingInvoice(cardId) {
    const invoices = invoicesByCard[cardId] || [];
    return invoices.find((inv) => inv.outstanding_amount > 0) || null;
  }

  // Pivo: agrupa por mes, uma barra por cartao dentro de cada grupo.
  const monthGroups = useMemo(() => {
    const months = new Set();
    Object.values(invoicesByCard).forEach((invoices) => {
      invoices.forEach((inv) => months.add(inv.reference_month));
    });
    const sortedMonths = [...months].sort();

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

      {banks.length === 0 && <div className="empty-state">Nenhum banco cadastrado ainda.</div>}

      {banks.map((bank) => {
        const bankAccounts = accounts.filter((a) => a.bank_id === bank.id);
        const checking = bankAccounts.find((a) => a.type === 'checking');
        const creditCard = bankAccounts.find((a) => a.type === 'credit_card');
        const investment = bankAccounts.find((a) => a.type === 'investment');
        const outstandingInvoice = creditCard?.credit_card ? latestOutstandingInvoice(creditCard.credit_card.id) : null;

        return (
          <div className="acct-block" key={bank.id}>
            <div className="acct-bank-head" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="chip" style={{ background: bank.color_hex }} />
                <span className="name">{bank.name}</span>
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
                <div className="t-label">Cartão de crédito</div>
                <div className="t-val num">
                  {creditCard?.credit_card ? fmt(creditCard.credit_card.used_amount) : '—'}
                </div>
                <div className="t-sub">
                  {creditCard?.credit_card
                    ? `de ${fmt(creditCard.credit_card.credit_limit)} · fecha dia ${creditCard.credit_card.closing_day} · vence dia ${creditCard.credit_card.due_day}`
                    : 'sem cartão'}
                </div>
                {outstandingInvoice && (
                  <button
                    type="button"
                    className="filter-clear"
                    style={{ color: 'var(--teal)', fontWeight: 700, marginTop: 8, padding: 0 }}
                    onClick={() => setPayingCard({ card: creditCard.credit_card, invoice: outstandingInvoice, bankName: bank.name })}
                  >
                    Pagar fatura
                  </button>
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

      {monthGroups.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
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
