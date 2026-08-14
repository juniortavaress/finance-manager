import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { groupsApi } from '../api/resources';
import { fmt } from '../utils/format';
import NewGroupModal from '../components/modals/NewGroupModal';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await groupsApi.list();
    setGroups(res.groups);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Grupos</h1>
        <div className="period" onClick={() => setModalOpen(true)}>
          + novo grupo
        </div>
      </div>

      <div className="group-grid">
        {groups.length === 0 && <div className="empty-hint">Nenhum grupo ainda.</div>}
        {groups.map((g) => {
          const cls = g.my_balance > 0 ? 'pos' : g.my_balance < 0 ? 'neg' : '';
          const color = g.my_balance > 0 ? 'var(--teal)' : g.my_balance < 0 ? 'var(--brick)' : 'var(--ink-faint)';
          const sub = g.my_balance > 0 ? 'a receber' : g.my_balance < 0 ? 'você deve' : 'quites';
          return (
            <Link to={`/amigos/grupos/${g.id}`} className="group-card" key={g.id}>
              <div className="group-card-head">
                <div className="group-icon" style={{ background: 'var(--gold-soft)' }}>
                  👥
                </div>
              </div>
              <div className="group-name">{g.name}</div>
              <div className="group-members">{g.member_count} pessoas</div>
              <div className={`group-balance ${cls}`} style={{ color }}>
                {fmt(Math.abs(g.my_balance))}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-faint)' }}>{sub}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <NewGroupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
