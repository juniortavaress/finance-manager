import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { settlementsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Registrar recebimento": o amigo te deve e te pagou por fora (dinheiro, pix
 * direto etc), sem passar pelo fluxo normal de acerto. Voce mesmo confirma que
 * recebeu, escolhendo sua propria conta de entrada -- quita o saldo na hora,
 * sem depender do amigo fazer nada no app.
 *
 * Quando aberto sem `groupId` (a partir de Amigos, quitando o saldo TOTAL),
 * `breakdown` traz as origens (avulso + grupos em comum) -- quitar ali cria um
 * settlement por origem com saldo positivo (o que ele me deve), ja que cada
 * grupo mantem seu proprio saldo isolado.
 */
export default function RegisterReceiptModal({ open, onClose, onSaved, groupId, friendUserId, counterpartyName, suggestedAmount, breakdown }) {
  const { checkingAccounts } = useData();
  const { showSuccess, showError } = useToast();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(suggestedAmount ? numberToMasked(Math.abs(suggestedAmount)) : '');
    setDate(todayIso());
    setAccountId(checkingAccounts[0]?.id || '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestedAmount]);

  if (!open) return null;

  const numericAmount = maskToNumber(amount);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!accountId) return setError('Selecione a conta de entrada.');

    setSubmitting(true);
    try {
      if (!groupId && breakdown && breakdown.length > 1) {
        // Quitar em Amigos: um settlement por origem com saldo positivo (o que ele
        // me deve), cada um pelo valor exato daquela origem -- nunca mistura grupos.
        const owedToMeByOrigin = breakdown.filter((b) => b.amount > 0);
        await Promise.all(
          owedToMeByOrigin.map((b) =>
            settlementsApi.receive({
              payer_id: friendUserId,
              friend_user_id: b.group_id ? undefined : friendUserId,
              group_id: b.group_id || undefined,
              amount: b.amount,
              date,
              receiver_account_id: accountId,
            })
          )
        );
      } else {
        await settlementsApi.receive({
          payer_id: friendUserId,
          friend_user_id: groupId ? undefined : friendUserId,
          group_id: groupId,
          amount: numericAmount,
          date,
          receiver_account_id: accountId,
        });
      }
      showSuccess('Recebimento registrado com sucesso.');
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível registrar o recebimento.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{counterpartyName ? `Registrar recebimento de ${counterpartyName}` : 'Registrar recebimento'}</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field-row">
            <div className="field">
              <label>Valor</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Sua conta de entrada</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {checkingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Confirmando...' : 'Confirmar recebimento'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
