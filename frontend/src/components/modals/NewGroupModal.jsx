import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { groupsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';
import ParticipantPicker from '../ParticipantPicker';

export default function NewGroupModal({ open, onClose, onCreated }) {
  const { friends } = useData();
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setMemberIds([]);
    setError('');
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe o nome do grupo.');

    setSubmitting(true);
    try {
      await groupsApi.create({ name: name.trim(), member_ids: memberIds });
      showSuccess('Grupo criado com sucesso.');
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível criar o grupo.';
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
          <h2>Novo grupo</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Nome do grupo</label>
            <input
              type="text"
              placeholder="Ex.: Viagem Floripa, Apê 302..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label>Membros</label>
            {friends.length === 0 ? (
              <div className="fatura-note show">Adicione amigos antes de criar um grupo.</div>
            ) : (
              <ParticipantPicker candidates={friends} selectedIds={memberIds} onChange={setMemberIds} />
            )}
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar grupo'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
