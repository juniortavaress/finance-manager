import { useEffect, useState } from 'react';
import { settlementsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';
import { planAllocations, totalOfOrigins } from '../../utils/settlement';
import { localIsoDate } from '../../utils/date';
import { useFormError } from '../../hooks/useFormError';

function todayIso() {
  return localIsoDate();
}

/**
 * "Marquei como pago": eu sou quem deve e estou registrando que ja paguei.
 * Escolho minha propria conta de saida -- o saldo ja fica quitado assim que
 * eu confirmo, sem esperar a outra pessoa. O recebimento do outro lado e um
 * fluxo separado (PendingPaymentCard + settlementsApi.recordReceipt).
 *
 * Quando aberto sem `groupId` (a partir de Amigos, quitando o saldo TOTAL),
 * `breakdown` traz as origens (avulso + grupos em comum) -- quitar ali cria um
 * settlement por origem com saldo negativo, ja que cada grupo mantem seu
 * proprio saldo isolado (nunca se mistura). Quitar de dentro de um grupo
 * (`groupId` presente) sempre cria um unico settlement escopado aquele grupo.
 */
export default function SettleUpModal({
  open,
  onClose,
  onSaved,
  groupId,
  friendUserId,
  counterpartyName,
  suggestedAmount,
  breakdown,
  checkingAccounts,
  creditCardAccounts,
  expenseCategories,
}) {
  const { showSuccess, showError } = useToast();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [, setError] = useFormError();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Em Amigos o valor sugerido quita TODAS as origens em que eu devo (cada
    // grupo tem saldo isolado), que pode diferir do saldo liquido mostrado.
    const owedTotal = !groupId && breakdown?.length ? totalOfOrigins(breakdown, -1) : Math.abs(suggestedAmount || 0);
    setAmount(owedTotal ? numberToMasked(owedTotal) : '');
    setDate(todayIso());
    setAccountId(checkingAccounts?.[0]?.id || creditCardAccounts?.[0]?.id || '');
    setCategoryId('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestedAmount]);

  if (!open) return null;

  const numericAmount = maskToNumber(amount);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!accountId) return setError('Selecione a conta de saída.');
    if (!categoryId) return setError('Selecione a categoria.');

    setSubmitting(true);
    try {
      // Um acerto por origem (avulso/grupo), em sequencia: cada um mexe no saldo
      // da mesma conta/fatura, entao nao podem correr em paralelo.
      const plan = groupId ? [{ group_id: groupId, amount: numericAmount }] : planAllocations(breakdown, -1, numericAmount);
      let registered = 0;
      try {
        for (const part of plan) {
          await settlementsApi.create({
            receiver_id: friendUserId,
            friend_user_id: part.group_id ? undefined : friendUserId,
            group_id: part.group_id || undefined,
            amount: part.amount,
            date,
            payer_account_id: accountId,
            category_id: categoryId,
          });
          registered += 1;
        }
      } catch (err) {
        if (registered > 0) {
          showError(`${registered} de ${plan.length} acertos foram registrados antes do erro: ${err.message}`);
          onSaved?.();
          return;
        }
        throw err;
      }
      showSuccess('Pagamento registrado com sucesso.');
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível registrar o acerto.';
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
          <h2>{counterpartyName ? `Marquei como pago para ${counterpartyName}` : 'Marquei como pago'}</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

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

          <div className="field-row">
            <div className="field">
              <label>Sua conta de saída</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <optgroup label="Contas correntes">
                  {(checkingAccounts || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Cartões de crédito">
                  {(creditCardAccounts || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Selecione...</option>
                {(expenseCategories || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Confirmando...' : 'Confirmar acerto'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
