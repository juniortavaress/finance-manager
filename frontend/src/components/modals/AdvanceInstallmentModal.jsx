import { useEffect, useState } from 'react';
import { installmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';

export default function AdvanceInstallmentModal({ open, onClose, onDone, plan, scheduledCount }) {
  const { showSuccess, showError } = useToast();
  const [count, setCount] = useState(1);
  const [totalAmount, setTotalAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCount(Math.min(1, scheduledCount));
    setTotalAmount('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);

  if (!open) return null;

  async function handleAdvance(e) {
    e.preventDefault();
    setError('');
    const numericTotal = parseFloat((totalAmount || '').toString().replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    if (count <= 0 || count > scheduledCount) return setError('Quantidade de parcelas inválida.');
    if (numericTotal <= 0) return setError('Informe o valor total a pagar.');

    setSubmitting(true);
    try {
      await installmentsApi.advance(plan.id, { count, total_amount: numericTotal });
      showSuccess('Parcelas adiantadas com sucesso.');
      onDone();
    } catch (err) {
      const message = err.message || 'Não foi possível adiantar as parcelas.';
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
          <h2>Adiantar parcelas</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleAdvance}>
          {error && <div className="form-error-banner">{error}</div>}

          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>{plan?.description}</p>

          <div className="field-row">
            <div className="field">
              <label>Quantidade de parcelas</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: scheduledCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Valor total a pagar</label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
