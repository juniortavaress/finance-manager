import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { creditCardsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';

export default function PayInvoiceModal({ open, onClose, onPaid, card, invoice, bankName }) {
  const { checkingAccounts } = useData();
  const { showSuccess, showError } = useToast();

  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAccountId(checkingAccounts[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  if (!open) return null;

  const outstanding = invoice ? invoice.total_amount - invoice.paid_amount : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!accountId) return setError('Selecione a conta de origem.');

    setSubmitting(true);
    try {
      await creditCardsApi.payInvoice(card.id, invoice.id, { account_id: accountId });
      showSuccess('Fatura paga com sucesso.');
      onPaid?.();
    } catch (err) {
      const message = err.message || 'Não foi possível pagar a fatura.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Pagar fatura</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
            Fatura {bankName} — saldo em aberto: <strong>{fmt(outstanding)}</strong>. O valor será debitado da conta
            escolhida.
          </p>

          <div className="field">
            <label>Conta de origem</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {checkingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Pagando...' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
