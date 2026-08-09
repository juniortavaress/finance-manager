import { useEffect, useState } from 'react';
import { installmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';

export default function CancelInstallmentModal({ open, onClose, onDone, plan, scheduledTxs }) {
  const { showSuccess, showError } = useToast();
  const [fromNumber, setFromNumber] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFromNumber(scheduledTxs?.[0]?.installment_number || '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);

  if (!open) return null;

  async function handleCancel(e) {
    e.preventDefault();
    setError('');
    if (!fromNumber) return setError('Selecione a partir de qual parcela cancelar.');

    setSubmitting(true);
    try {
      await installmentsApi.cancelFrom(plan.id, fromNumber);
      showSuccess('Parcelas canceladas com sucesso.');
      onDone();
    } catch (err) {
      const message = err.message || 'Não foi possível cancelar as parcelas.';
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
          <h2>Cancelar parcelas</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleCancel}>
          {error && <div className="form-error-banner">{error}</div>}

          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>{plan?.description}</p>

          <div className="field">
            <label>Cancelar a partir da parcela</label>
            <select value={fromNumber} onChange={(e) => setFromNumber(Number(e.target.value))}>
              {(scheduledTxs || []).map((t) => (
                <option key={t.installment_number} value={t.installment_number}>
                  {t.installment_number}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Voltar
            </div>
            <button className="btn btn-danger" type="submit" disabled={submitting}>
              {submitting ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
