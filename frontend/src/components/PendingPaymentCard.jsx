import { useState } from 'react';
import { useData } from '../context/DataContext';
import { fmt } from '../utils/format';

/**
 * Card de pendencia reusado para dois casos: "vincular pagamento que eu fiz"
 * (despesa criada com outra pessoa marcada como pagadora, ou minha propria
 * despesa sem conta ainda) e "confirmar recebimento" (settlement em que sou
 * o receiver). Mesma UI -- texto + seletor de conta e categoria proprios +
 * botao confirmar. `kind` define se a categoria e de despesa ou receita.
 */
export default function PendingPaymentCard({ label, amount, accountIdDefault, kind = 'expense', onConfirm }) {
  const { checkingAccounts, expenseCategories, incomeCategories } = useData();
  const categories = kind === 'income' ? incomeCategories : expenseCategories;
  const [accountId, setAccountId] = useState(accountIdDefault || checkingAccounts[0]?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!accountId || !categoryId) return;
    setSubmitting(true);
    try {
      await onConfirm(accountId, categoryId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pending-payment-card">
      <div className="pending-payment-info">
        <div className="pending-payment-label">{label}</div>
        <div className="pending-payment-amount num">{fmt(amount)}</div>
      </div>
      <div className="pending-payment-actions">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {checkingAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Categoria...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting || !accountId || !categoryId}
          onClick={handleConfirm}
        >
          {submitting ? 'Confirmando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}
