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

export default function FriendRequestsModal({ open, onClose, requests, onAccept, onReject }) {
  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Pedidos de amizade</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="modal-body">
          {requests.length === 0 && <div className="empty-hint">Nenhum pedido pendente.</div>}
          {requests.map((r) => (
            <div className="friend-row" key={r.id}>
              <div className="friend-left">
                <div className="friend-avatar">{initials(r.requester.name)}</div>
                <div>
                  <div className="friend-name">{r.requester.name}</div>
                  <div className="friend-sub">quer ser seu amigo</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => onReject(r.id)}>
                  Recusar
                </button>
                <button className="btn btn-primary" onClick={() => onAccept(r.id)}>
                  Aceitar
                </button>
              </div>
            </div>
          ))}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Fechar
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
