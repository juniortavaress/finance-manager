import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { transactionsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TransferModal({ open, onClose, onCreated }) {
  const { checkingAccounts } = useData();
  const { showSuccess, showError } = useToast();

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFromAccountId(checkingAccounts[0]?.id || '');
    setToAccountId(checkingAccounts[1]?.id || '');
    setAmount('');
    setDate(todayIso());
    setDescription('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const numericAmount = maskToNumber(amount);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!fromAccountId || !toAccountId) return setError('Selecione as contas de origem e destino.');
    if (fromAccountId === toAccountId) return setError('As contas de origem e destino devem ser diferentes.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');

    setSubmitting(true);
    try {
      await transactionsApi.transfer({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: numericAmount,
        date,
        description: description.trim() || undefined,
      });
      showSuccess('Transferência realizada com sucesso.');
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível realizar a transferência.';
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
          <h2>Transferir entre contas</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}
          {checkingAccounts.length < 2 && (
            <div className="form-error-banner">
              Você precisa de pelo menos duas contas correntes para transferir dinheiro entre elas.
            </div>
          )}

          <div className="field">
            <label>De</label>
            <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              {checkingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Para</label>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {checkingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

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
            <label>Descrição (opcional)</label>
            <input
              type="text"
              placeholder="Ex.: Reserva de emergência"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting || checkingAccounts.length < 2}>
              {submitting ? 'Transferindo...' : 'Transferir'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
