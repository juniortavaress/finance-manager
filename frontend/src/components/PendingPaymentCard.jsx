import { useState } from 'react';
import { useData } from '../context/DataContext';
import { fmt } from '../utils/format';

/**
 * Card de pendencia reusado para dois casos: "vincular pagamento que eu fiz"
 * (despesa criada com outra pessoa marcada como pagadora, ou minha propria
 * despesa sem conta ainda) e "confirmar recebimento" (settlement em que sou
 * o receiver). Mesma UI -- texto + seletor de conta propria + botao confirmar.
 */
export default function PendingPaymentCard({ label, amount, accountIdDefault, onConfirm }) {
  const { checkingAccounts } = useData();
  const [accountId, setAccountId] = useState(accountIdDefault || checkingAccounts[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!accountId) return;
    setSubmitting(true);
    try {
      await onConfirm(accountId);
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
        <button type="button" className="btn btn-primary" disabled={submitting || !accountId} onClick={handleConfirm}>
          {submitting ? 'Confirmando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}
