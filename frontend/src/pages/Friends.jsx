import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { friendsApi, sharedExpensesApi, settlementsApi, groupsApi } from '../api/resources';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDateShort } from '../utils/format';
import SharedExpenseModal from '../components/modals/SharedExpenseModal';
import SettleUpModal from '../components/modals/SettleUpModal';
import RegisterReceiptModal from '../components/modals/RegisterReceiptModal';
import ExpenseScopePickerModal from '../components/modals/ExpenseScopePickerModal';
import PendingPaymentCard from '../components/PendingPaymentCard';

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

export default function Friends() {
  const { friends, reloadAll } = useData();
  const { showSuccess, showError } = useToast();
  const [activity, setActivity] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [expenseScope, setExpenseScope] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);

  const load = useCallback(async () => {
    const [actRes, payRes, recRes, groupsRes] = await Promise.all([
      friendsApi.activity(10),
      sharedExpensesApi.pendingPayments(),
      settlementsApi.pendingReceipts(),
      groupsApi.list(),
    ]);
    setActivity(actRes.activity);
    setPendingPayments(payRes.shared_expenses);
    setPendingReceipts(recRes.settlements);
    setGroups(groupsRes.groups);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLinkPayment(expenseId, accountId, categoryId) {
    try {
      await sharedExpensesApi.linkPayment(expenseId, accountId, categoryId);
      showSuccess('Pagamento vinculado com sucesso.');
      await Promise.all([load(), reloadAll()]);
    } catch (err) {
      showError(err.message || 'Não foi possível vincular o pagamento.');
    }
  }

  async function handleRecordReceipt(settlementId, accountId, categoryId) {
    try {
      await settlementsApi.recordReceipt(settlementId, accountId, categoryId);
      showSuccess('Recebimento registrado com sucesso.');
      await Promise.all([load(), reloadAll()]);
    } catch (err) {
      showError(err.message || 'Não foi possível registrar o recebimento.');
    }
  }

  const totalReceber = friends.filter((f) => f.balance > 0).reduce((s, f) => s + f.balance, 0);
  const totalDeve = friends.filter((f) => f.balance < 0).reduce((s, f) => s + Math.abs(f.balance), 0);
  const saldoLiquido = totalReceber - totalDeve;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>
          Amigos{' '}
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontWeight: 400 }}>
            — visão geral
          </span>
        </h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={() => setScopePickerOpen(true)}
        >
          + nova despesa dividida
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Você vai receber</div>
          <div className="value num" style={{ color: 'var(--teal)' }}>
            {fmt(totalReceber)}
          </div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Você deve</div>
          <div className="value num" style={{ color: 'var(--brick)' }}>
            {fmt(totalDeve)}
          </div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Saldo líquido</div>
          <div className="value num" style={{ color: saldoLiquido >= 0 ? 'var(--teal)' : 'var(--brick)' }}>
            {fmt(saldoLiquido)}
          </div>
        </div>
      </div>

      {(pendingPayments.length > 0 || pendingReceipts.length > 0) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3>Pendências</h3>
          {pendingPayments.map((e) => (
            <PendingPaymentCard
              key={e.id}
              label={`Você pagou "${e.description}" — em qual conta saiu?`}
              amount={e.total_amount}
              kind="expense"
              onConfirm={(accountId, categoryId) => handleLinkPayment(e.id, accountId, categoryId)}
            />
          ))}
          {pendingReceipts.map((s) => (
            <PendingPaymentCard
              key={s.id}
              label={`${s.payer.name} te pagou — em qual conta caiu?`}
              amount={s.amount}
              kind="income"
              onConfirm={(accountId, categoryId) => handleRecordReceipt(s.id, accountId, categoryId)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>
            Saldo por amigo <Link to="/amigos/lista" className="action">ver todos →</Link>
          </h3>
          {friends.length === 0 && <div className="empty-hint">Nenhum amigo ainda.</div>}
          {friends.slice(0, 4).map((f) => {
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
        <div className="card">
          <h3>Atividade recente</h3>
          {activity.length === 0 && <div className="empty-hint">Nenhuma atividade ainda.</div>}
          {activity.map((item, idx) => (
            <div className="tx-row" key={idx}>
              <div className="tx-left">
                <div className="tx-icon" style={{ background: 'var(--bg)' }}>
                  {item.type === 'expense' ? '🧾' : '💬'}
                </div>
                <div>
                  <div className="tx-desc" style={{ fontWeight: 500 }}>
                    {item.type === 'expense'
                      ? `${item.data.description} — ${fmt(item.data.total_amount)}`
                      : `Acerto de ${fmt(item.data.amount)}`}
                  </div>
                  <div className="tx-meta">{fmtDateShort(item.data.date)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExpenseScopePickerModal
        open={scopePickerOpen}
        onClose={() => setScopePickerOpen(false)}
        groups={groups}
        onPickFriend={(friendId) => {
          const f = friends.find((fr) => fr.id === friendId);
          setExpenseScope({ friendUserId: friendId, friendName: f?.name || '' });
          setScopePickerOpen(false);
        }}
        onPickGroup={async (groupId) => {
          try {
            const res = await groupsApi.get(groupId);
            setExpenseScope({ groupId, groupMembers: res.group.members });
            setScopePickerOpen(false);
          } catch (err) {
            showError(err.message || 'Não foi possível carregar o grupo.');
          }
        }}
      />

      <SharedExpenseModal
        open={!!expenseScope}
        onClose={() => setExpenseScope(null)}
        friendUserId={expenseScope?.friendUserId}
        friendName={expenseScope?.friendName}
        groupId={expenseScope?.groupId}
        groupMembers={expenseScope?.groupMembers}
        groups={groups}
        onSaved={() => {
          setExpenseScope(null);
          load();
          reloadAll();
        }}
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
          load();
          reloadAll();
        }}
      />

      <RegisterReceiptModal
        open={!!receiptTarget}
        onClose={() => setReceiptTarget(null)}
        friendUserId={receiptTarget?.id}
        counterpartyName={receiptTarget?.name}
        suggestedAmount={receiptTarget?.balance}
        breakdown={receiptTarget?.balance_breakdown}
        onSaved={() => {
          setReceiptTarget(null);
          load();
          reloadAll();
        }}
      />
    </div>
  );
}
