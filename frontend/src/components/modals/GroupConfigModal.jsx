import { IconCheck } from '../icons';
import ModalShell from './ModalShell';

export default function GroupConfigModal({
  open,
  onClose,
  simplified,
  onToggleSimplified,
  onDeleteGroup,
  deleteDisabled,
}) {
  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Configurações do grupo</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="modal-body">
          <button type="button" className="group-config-item" onClick={onToggleSimplified}>
            <span>Simplificar dívidas</span>
            {simplified && <IconCheck style={{ width: 14, height: 14, color: 'var(--teal)' }} />}
          </button>
          <button
            type="button"
            className="group-config-item danger"
            disabled={deleteDisabled}
            title={deleteDisabled ? 'Quite todos os saldos antes de excluir o grupo' : ''}
            onClick={onDeleteGroup}
          >
            Excluir grupo
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
