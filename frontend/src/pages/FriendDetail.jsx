import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { friendsApi } from '../api/resources';
import { fmt, fmtDateShort } from '../utils/format';
import SharedExpenseModal from '../components/modals/SharedExpenseModal';
import SettleUpModal from '../components/modals/SettleUpModal';
import RegisterReceiptModal from '../components/modals/RegisterReceiptModal';

function myShareInExpense(expense, userId) {
  const myPart = expense.participants.find((p) => String(p.user_id) === String(userId));
  const myShareAmount = myPart ? myPart.share_amount : 0;
  if (String(expense.paid_by_id) === String(userId)) {
    return expense.total_amount - myShareAmount;
  }
  return -myShareAmount;
}

function myShareInSettlement(settlement, userId) {
  // Se eu paguei, meu saldo melhora (+amount, quitei uma dívida). Se eu recebi, piora (-amount).
  return String(settlement.payer_id) === String(userId) ? settlement.amount : -settlement.amount;
}

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function FriendDetail() {
  const { friendUserId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { friends, reloadAll } = useData();
  const friend = friends.find((f) => f.id === friendUserId);

  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [breakdown, setBreakdown] = useState([]);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!friendUserId) return;
    const [histRes, balRes] = await Promise.all([
      friendsApi.history(friendUserId),
      friendsApi.balance(friendUserId),
    ]);
    setHistory(histRes.history);
    setBalance(balRes.total);
    setBreakdown(balRes.breakdown || []);
  }, [friendUserId]);

  const timeline = useMemo(() => {
    const groupSummaries = new Map();
    const rows = [];

    for (const item of history) {
      const isGroupExpense = item.type === 'expense' && item.data.group_id;
      if (!isGroupExpense) {
        rows.push({ kind: item.type, sortKey: item.data.created_at || item.date, data: item.data });
        continue;
      }

      const e = item.data;
      const existing = groupSummaries.get(e.group_id);
      if (existing) {
        existing.count += 1;
        if ((e.created_at || e.date) > existing.sortKey) existing.sortKey = e.created_at || e.date;
      } else {
        const groupBreakdown = breakdown.find((b) => b.group_id === e.group_id);
        groupSummaries.set(e.group_id, {
          kind: 'group-summary',
          groupId: e.group_id,
          groupName: e.group_name,
          groupIcon: e.group_icon,
          groupColorHex: e.group_color_hex,
          total: groupBreakdown ? groupBreakdown.amount : 0,
          count: 1,
          sortKey: e.created_at || e.date,
        });
      }
    }

    for (const summary of groupSummaries.values()) rows.push(summary);
    rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
    return rows;
  }, [history, breakdown]);

  useEffect(() => {
    load();
  }, [load]);

  if (!friend) {
    return (
      <div className="screen">
        <div className="back-link" onClick={() => navigate('/amigos/lista')}>
          ← Voltar pra Amigos
        </div>
        <div className="empty-hint">Amigo não encontrado.</div>
      </div>
    );
  }

  function openNewExpense() {
    setEditingExpense(null);
    setExpenseModalOpen(true);
  }

  function openEditExpense(expense) {
    setEditingExpense(expense);
    setExpenseModalOpen(true);
  }

  return (
    <div className="screen">
      <div className="back-link" onClick={() => navigate('/amigos/lista')}>
        ← Voltar pra Amigos
      </div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="friend-avatar">{initials(friend.name)}</div>
          <div>
            <h1 style={{ fontSize: 22 }}>{friend.name}</h1>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {balance === 0 ? (
                <span style={{ color: 'var(--ink-faint)' }}>Vocês estão quites</span>
              ) : balance > 0 ? (
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{friend.name} te deve {fmt(balance)}</span>
              ) : (
                <span style={{ color: 'var(--brick)', fontWeight: 600 }}>Você deve {fmt(Math.abs(balance))}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="period" onClick={openNewExpense}>
            + nova despesa
          </div>
          {balance < 0 && (
            <div
              className="period"
              style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
              onClick={() => setSettleModalOpen(true)}
            >
              Marquei como pago
            </div>
          )}
          {balance > 0 && (
            <div
              className="period"
              style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
              onClick={() => setReceiptModalOpen(true)}
            >
              Quitar dívida
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Despesas em comum</h3>
        {timeline.length === 0 && <div className="empty-hint">Nenhuma despesa em comum ainda.</div>}
        {timeline.map((item) => {
          if (item.kind === 'group-summary') {
            return (
              <Link
                to={`/amigos/grupos/${item.groupId}`}
                className="expense-row"
                key={`group-${item.groupId}`}
                style={{ cursor: 'pointer', display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="expense-top">
                  <div className="expense-left">
                    <div
                      className="expense-icon"
                      style={
                        item.groupColorHex
                          ? { background: `${item.groupColorHex}22`, color: item.groupColorHex }
                          : undefined
                      }
                    >
                      {item.groupIcon || '👥'}
                    </div>
                    <div>
                      <div className="expense-desc">Saldo grupo {item.groupName}</div>
                      <div className="expense-meta">
                        {item.count} despesa{item.count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="expense-right">
                    <div
                      className="expense-total num"
                      style={{ color: item.total > 0 ? 'var(--teal)' : item.total < 0 ? 'var(--brick)' : 'var(--ink-faint)' }}
                    >
                      {item.total > 0
                        ? `a receber ${fmt(item.total)}`
                        : item.total < 0
                        ? `a pagar ${fmt(Math.abs(item.total))}`
                        : 'quitado'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          }

          if (item.kind === 'expense') {
            const e = item.data;
            const myShare = myShareInExpense(e, user?.id);
            return (
              <div className="expense-row" key={e.id} onClick={() => openEditExpense(e)} style={{ cursor: 'pointer' }}>
                <div className="expense-top">
                  <div className="expense-left">
                    <div className="expense-icon">🧾</div>
                    <div>
                      <div className="expense-desc">{e.description}</div>
                      <div className="expense-meta">avulso · pago por {e.paid_by.name} · {fmtDateShort(e.date)}</div>
                    </div>
                  </div>
                  <div className="expense-right">
                    <div className="expense-total num">{fmt(e.total_amount)}</div>
                    <div
                      className="expense-share num"
                      style={{ color: myShare > 0 ? 'var(--teal)' : myShare < 0 ? 'var(--brick)' : 'var(--ink-faint)' }}
                    >
                      {myShare > 0
                        ? `a receber ${fmt(myShare)}`
                        : myShare < 0
                        ? `a pagar ${fmt(Math.abs(myShare))}`
                        : 'quitado'}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const s = item.data;
          const myShare = myShareInSettlement(s, user?.id);
          const iPaid = String(s.payer_id) === String(user?.id);
          return (
            <div className="expense-row settlement-row" key={s.id}>
              <div className="expense-top">
                <div className="expense-left">
                  <div className="expense-icon settlement-icon">💸</div>
                  <div>
                    <div className="expense-desc">Acerto de contas</div>
                    <div className="expense-meta">
                      {s.group_name ? `${s.group_name} · ` : 'avulso · '}
                      {iPaid ? `você pagou ${s.receiver.name}` : `${s.payer.name} te pagou`} · {fmtDateShort(s.date)}
                    </div>
                  </div>
                </div>
                <div className="expense-right">
                  <div className="expense-total num">{fmt(s.amount)}</div>
                  <div className="expense-share num" style={{ color: myShare > 0 ? 'var(--teal)' : 'var(--brick)' }}>
                    {myShare > 0 ? `quitou ${fmt(myShare)}` : `recebeu ${fmt(Math.abs(myShare))}`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <SharedExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        expense={editingExpense}
        friendUserId={friendUserId}
        friendName={friend.name}
        onSaved={() => {
          setExpenseModalOpen(false);
          load();
          reloadAll();
        }}
        onDeleted={() => {
          setExpenseModalOpen(false);
          load();
          reloadAll();
        }}
      />

      <SettleUpModal
        open={settleModalOpen}
        onClose={() => setSettleModalOpen(false)}
        friendUserId={friendUserId}
        counterpartyName={friend.name}
        suggestedAmount={balance}
        breakdown={breakdown}
        onSaved={() => {
          setSettleModalOpen(false);
          load();
          reloadAll();
        }}
      />

      <RegisterReceiptModal
        open={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        friendUserId={friendUserId}
        counterpartyName={friend.name}
        suggestedAmount={balance}
        breakdown={breakdown}
        onSaved={() => {
          setReceiptModalOpen(false);
          load();
          reloadAll();
        }}
      />
    </div>
  );
}
