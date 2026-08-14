import { useData } from '../../context/DataContext';
import ModalShell from './ModalShell';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/**
 * Passo anterior ao modal de nova despesa quando aberto da visão geral de
 * Amigos: escolhe primeiro com quem é a despesa (um amigo ou um grupo) antes
 * de abrir o formulário completo, já com o escopo fixo.
 */
export default function ExpenseScopePickerModal({ open, onClose, groups, onPickFriend, onPickGroup }) {
  const { friends } = useData();

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Nova despesa dividida</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Com quem é essa despesa?</label>
          </div>

          {friends.length === 0 && groups.length === 0 && (
            <div className="empty-hint">Adicione um amigo ou crie um grupo primeiro.</div>
          )}

          {groups.length > 0 && (
            <>
              <div className="participant-picker-label">Grupos</div>
              {groups.map((g) => (
                <div className="friend-row" key={g.id} style={{ cursor: 'pointer' }} onClick={() => onPickGroup(g.id)}>
                  <div className="friend-left">
                    <div
                      className="friend-avatar"
                      style={g.color_hex ? { background: `${g.color_hex}22`, color: g.color_hex } : undefined}
                    >
                      {g.icon || '👥'}
                    </div>
                    <div>
                      <div className="friend-name">{g.name}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {friends.length > 0 && (
            <>
              <div className="participant-picker-label" style={{ marginTop: groups.length > 0 ? 12 : 0 }}>
                Amigos
              </div>
              {friends.map((f) => (
                <div className="friend-row" key={f.id} style={{ cursor: 'pointer' }} onClick={() => onPickFriend(f.id)}>
                  <div className="friend-left">
                    <div className="friend-avatar">{initials(f.name)}</div>
                    <div>
                      <div className="friend-name">{f.name}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
