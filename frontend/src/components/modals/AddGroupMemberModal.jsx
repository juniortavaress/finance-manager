import { useEffect, useState } from 'react';
import { groupsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';
import ParticipantPicker from '../ParticipantPicker';

export default function AddGroupMemberModal({ open, onClose, onAdded, groupId, candidates }) {
  const { showSuccess, showError } = useToast();
  const [memberIds, setMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMemberIds([]);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await Promise.all(memberIds.map((id) => groupsApi.addMember(groupId, id)));
      showSuccess('Membros adicionados.');
      onAdded?.();
    } catch (err) {
      showError(err.message || 'Não foi possível adicionar os membros.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Adicionar membros</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {candidates.length === 0 ? (
            <div className="empty-hint">Todos os seus amigos já fazem parte deste grupo.</div>
          ) : (
            <div className="field">
              <label>Amigos</label>
              <ParticipantPicker candidates={candidates} selectedIds={memberIds} onChange={setMemberIds} />
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting || memberIds.length === 0}>
              {submitting ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
