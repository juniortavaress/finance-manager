import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { groupsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';
import ParticipantPicker from '../ParticipantPicker';

const ICON_OPTIONS = [
  '👥', '🏠', '✈️', '🎉', '🍽️', '🏖️', '🎓', '💼', '🚗', '🎮', '⚽', '🎬', '🛍️', '🍺', '🏕️', '💍',
];
const COLOR_OPTIONS = ['#0F5C5C', '#C0912F', '#A6432C', '#7A4FE0', '#3D7A8C', '#D97757', '#8B9A97', '#1C2B29'];

/**
 * Modal unico para criar OU editar um grupo. Se `group` for passado, edita
 * (nome/icone/cor); senao, cria um novo (com selecao de membros iniciais).
 */
export default function NewGroupModal({ open, onClose, onSaved, onCreated, group }) {
  const isEditing = !!group;
  const { friends } = useData();
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [memberIds, setMemberIds] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setName(group.name);
      setIcon(group.icon || ICON_OPTIONS[0]);
      setColor(group.color_hex || COLOR_OPTIONS[0]);
    } else {
      setName('');
      setIcon(ICON_OPTIONS[0]);
      setColor(COLOR_OPTIONS[0]);
      setMemberIds([]);
    }
  }, [open, isEditing, group]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe o nome do grupo.');

    setSubmitting(true);
    try {
      if (isEditing) {
        await groupsApi.update(group.id, { name: name.trim(), icon, color_hex: color });
        showSuccess('Grupo atualizado com sucesso.');
      } else {
        await groupsApi.create({ name: name.trim(), icon, color_hex: color, member_ids: memberIds });
        showSuccess('Grupo criado com sucesso.');
      }
      onSaved?.();
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o grupo.';
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
          <h2>{isEditing ? 'Editar grupo' : 'Novo grupo'}</h2>
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
            <label>Ícone</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ICON_OPTIONS.map((i) => (
                <div
                  key={i}
                  onClick={() => setIcon(i)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    cursor: 'pointer',
                    background: icon === i ? 'var(--teal-soft)' : 'var(--bg)',
                    border: icon === i ? '1.5px solid var(--teal)' : '1.5px solid transparent',
                  }}
                >
                  {i}
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Cor</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    cursor: 'pointer',
                    border: color === c ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: color === c ? '0 0 0 2px var(--surface)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {!isEditing && (
            <div className="field">
              <label>Membros</label>
              {friends.length === 0 ? (
                <div className="fatura-note show">Adicione amigos antes de criar um grupo.</div>
              ) : (
                <ParticipantPicker candidates={friends} selectedIds={memberIds} onChange={setMemberIds} />
              )}
            </div>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar grupo'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
