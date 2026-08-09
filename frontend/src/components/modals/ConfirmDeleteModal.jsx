import { useState } from 'react';
import ModalShell from './ModalShell';
import { useToast } from '../../context/ToastContext';

/**
 * Modal de confirmacao generico para exclusao. Usado por todos os modais com
 * acao de excluir: recebe titulo/mensagem/acao, e opcionalmente conteudo extra
 * via children (ex.: seletor de reatribuicao de categoria).
 */
export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = 'Excluir',
  message,
  confirmLabel = 'Excluir',
  confirmingLabel = 'Excluindo...',
  confirmVariant = 'danger',
  errorFallback = 'Erro ao excluir. Tente novamente.',
  loading = false,
  confirmDisabled = false,
  children,
}) {
  const { showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      showError(errorFallback);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Verificando...</p>
          ) : (
            <>
              {message && (
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: children ? 14 : 0 }}>
                  {message}
                </p>
              )}
              {children}
            </>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button
              className={`btn btn-${confirmVariant}`}
              type="button"
              onClick={handleConfirm}
              disabled={loading || submitting || confirmDisabled}
            >
              {submitting ? confirmingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
