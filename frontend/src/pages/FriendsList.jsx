import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { IconSearch } from '../components/icons';
import { fmt } from '../utils/format';
import AddFriendModal from '../components/modals/AddFriendModal';
import SettleUpModal from '../components/modals/SettleUpModal';
import RegisterReceiptModal from '../components/modals/RegisterReceiptModal';

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
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);

  const filtered = friends.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Amigos</h1>
        <div className="period" onClick={() => setAddModalOpen(true)}>
          + adicionar amigo
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

      <AddFriendModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onSent={reloadAll} />

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
