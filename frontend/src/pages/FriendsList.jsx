import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { friendsApi } from '../api/resources';
import { useToast } from '../context/ToastContext';
import { IconSearch, IconBell } from '../components/icons';
import { fmt } from '../utils/format';
import AddFriendModal from '../components/modals/AddFriendModal';
import SettleUpModal from '../components/modals/SettleUpModal';
import RegisterReceiptModal from '../components/modals/RegisterReceiptModal';
import FriendRequestsModal from '../components/modals/FriendRequestsModal';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function saldoLabel(v) {
  if (v > 0) return { cls: 'pos', texto: fmt(v), sub: 'te deve' };
  if (v < 0) return { cls: 'neg', texto: fmt(Math.abs(v)), sub: 'você deve' };
  return { cls: 'zero', texto: 'R$ 0,00', sub: 'quites' };
}

export default function FriendsList() {
  const { friends, reloadAll } = useData();
  const { showSuccess, showError } = useToast();
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);
  const [requests, setRequests] = useState({ sent: [], received: [] });
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);

  const loadRequests = useCallback(async () => {
    const res = await friendsApi.requests();
    setRequests(res);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleAccept(id) {
    try {
      await friendsApi.acceptRequest(id);
      showSuccess('Solicitação aceita.');
      await Promise.all([loadRequests(), reloadAll()]);
    } catch (err) {
      showError(err.message || 'Não foi possível aceitar.');
    }
  }

  async function handleReject(id) {
    try {
      await friendsApi.rejectRequest(id);
      await loadRequests();
    } catch (err) {
      showError(err.message || 'Não foi possível recusar.');
    }
  }

  const filtered = friends.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  const pendingCount = requests.received.length;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Amigos</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="period" onClick={() => setAddModalOpen(true)}>
            + adicionar amigo
          </div>
          <button
            type="button"
            className="notif-bell-trigger"
            onClick={() => setRequestsModalOpen(true)}
            aria-label="Pedidos de amizade"
          >
            <IconBell />
            {pendingCount > 0 && <span className="notif-badge">{pendingCount}</span>}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 6 }}>
        <div className="filter-bar">
          <div className="filter-search">
            <IconSearch />
            <input type="text" placeholder="Buscar amigo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 && <div className="empty-hint">Nenhum amigo encontrado.</div>}
        {filtered.map((f) => {
          const s = saldoLabel(f.balance);
          return (
            <div className="friend-row" key={f.id}>
              <Link to={`/amigos/${f.id}`} className="friend-left" style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                <div className="friend-avatar">{initials(f.name)}</div>
                <div>
                  <div className="friend-name">{f.name}</div>
                  <div className="friend-sub">{s.sub}</div>
                </div>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={`balance-pill ${s.cls} num`}>{s.texto}</div>
                {f.balance < 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }}
                    onClick={() => setSettleTarget(f)}
                  >
                    Acertar
                  </button>
                )}
                {f.balance > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }}
                    onClick={() => setReceiptTarget(f)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AddFriendModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSent={() => {
          reloadAll();
          loadRequests();
        }}
      />

      <FriendRequestsModal
        open={requestsModalOpen}
        onClose={() => setRequestsModalOpen(false)}
        requests={requests.received}
        onAccept={handleAccept}
        onReject={handleReject}
      />

      <SettleUpModal
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        friendUserId={settleTarget?.id}
        counterpartyName={settleTarget?.name}
        suggestedAmount={settleTarget?.balance}
        breakdown={settleTarget?.balance_breakdown}
        onSaved={() => {
          setSettleTarget(null);
          reloadAll();
        }}
      />

      <RegisterReceiptModal
        open={!!receiptTarget}
        onClose={() => setReceiptTarget(null)}
        friendUserId={receiptTarget?.id}
        counterpartyName={receiptTarget?.name}
        breakdown={receiptTarget?.balance_breakdown}
        suggestedAmount={receiptTarget?.balance}
        onSaved={() => {
          setReceiptTarget(null);
          reloadAll();
        }}
      />
    </div>
  );
}
