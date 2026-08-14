import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { groupsApi } from '../api/resources';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDateShort } from '../utils/format';
import { IconGear } from '../components/icons';
import SharedExpenseModal from '../components/modals/SharedExpenseModal';
import SettleUpModal from '../components/modals/SettleUpModal';
import RegisterReceiptModal from '../components/modals/RegisterReceiptModal';
import MemberPairsModal from '../components/modals/MemberPairsModal';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';
import AddGroupMemberModal from '../components/modals/AddGroupMemberModal';
import GroupConfigModal from '../components/modals/GroupConfigModal';

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
  if (v > 0) return { cls: 'pos', texto: fmt(v) };
  if (v < 0) return { cls: 'neg', texto: fmt(Math.abs(v)) };
  return { cls: 'zero', texto: 'R$ 0,00' };
}

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { friends, reloadAll } = useData();
  const { showSuccess, showError } = useToast();

  const [group, setGroup] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);
  const [pairsModalMember, setPairsModalMember] = useState(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  async function toggleSimplified() {
    try {
      await groupsApi.update(groupId, { simplify_debts: !group.simplify_debts });
      load();
    } catch (err) {
      showError(err.message || 'Não foi possível alterar a preferência do grupo.');
    }
  }

  const load = useCallback(async () => {
    const groupRes = await groupsApi.get(groupId);
    setGroup(groupRes.group);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!group) {
    return (
      <div className="screen">
        <div className="back-link" onClick={() => navigate('/amigos/grupos')}>
          ← Voltar pra Grupos
        </div>
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

  async function handleRemoveMember(memberUserId) {
    try {
      await groupsApi.removeMember(groupId, memberUserId);
      showSuccess('Membro removido.');
      load();
    } catch (err) {
      showError(err.message || 'Não foi possível remover esse membro.');
    }
  }

  async function handleDeleteGroup() {
    await groupsApi.remove(groupId);
    showSuccess('Grupo excluído.');
    navigate('/amigos/grupos');
  }

  function settleWithMember(memberUserId, amount, name) {
    setSettleTarget({ toUserId: memberUserId, amount: Math.abs(amount), name });
  }

  function receiveFromMember(memberUserId, amount, name) {
    setReceiptTarget({ fromUserId: memberUserId, amount: Math.abs(amount), name });
  }

  // Pares (quem deve pra quem) ja resolvidos pelo backend conforme a preferencia
  // salva no grupo: simplificados (menor numero de transferencias) ou originais
  // (uma linha por par devedor/credor, direto das despesas) -- controlado pelo
  // toggle "Simplificar dividas" no config do grupo, persistido no servidor para
  // que a tela de Amigos calcule o saldo por pessoa da mesma forma.
  const activePairs = group.original_debts || [];

  function pairsForMember(memberUserId) {
    return activePairs.filter((t) => t.from_user_id === memberUserId || t.to_user_id === memberUserId);
  }

  const memberCandidates = friends.filter((f) => !group.members.some((m) => m.user_id === f.id));

  return (
    <div className="screen">
      <div className="back-link" onClick={() => navigate('/amigos/grupos')}>
        ← Voltar pra Grupos
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          className="group-config-trigger"
          onClick={() => setConfigOpen(true)}
          aria-label="Configurações do grupo"
        >
          <IconGear />
        </button>
      </div>

      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="group-icon" style={{ width: 44, height: 44, fontSize: 20, background: 'var(--gold-soft)' }}>
            👥
          </div>
          <div>
            <h1 style={{ fontSize: 22 }}>{group.name}</h1>
            <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2 }}>
              {group.members.length} pessoas
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="period" onClick={() => setAddMemberOpen(true)}>
            + adicionar membro
          </div>
          <div
            className="period"
            style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
            onClick={openNewExpense}
          >
            + nova despesa no grupo
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3>Saldo dos membros</h3>

          {group.members.map((m) => {
            const s = saldoLabel(m.balance);
            const isMe = m.user_id === user?.id;
            const memberPairs = pairsForMember(m.user_id);
            const hasPairs = memberPairs.length > 0;
            const toReceive = memberPairs
              .filter((t) => t.to_user_id === m.user_id)
              .reduce((sum, t) => sum + t.amount, 0);
            const toPay = memberPairs
              .filter((t) => t.from_user_id === m.user_id)
              .reduce((sum, t) => sum + t.amount, 0);
            return (
              <div
                className="friend-row"
                key={m.id}
                style={{ cursor: hasPairs ? 'pointer' : 'default' }}
                onClick={() => hasPairs && setPairsModalMember(m)}
              >
                <div className="friend-left">
                  <div className="friend-avatar">{initials(m.user?.name)}</div>
                  <div className="friend-name">
                    {m.user?.name}
                    {isMe && ' (você)'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.cls === 'zero' && hasPairs ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {toReceive > 0 && <div className="balance-pill pos num">+{fmt(toReceive)}</div>}
                      {toPay > 0 && <div className="balance-pill neg num">-{fmt(toPay)}</div>}
                    </div>
                  ) : (
                    <div className={`balance-pill ${s.cls} num`}>{s.texto}</div>
                  )}
                  {!isMe && hasPairs && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPairsModalMember(m);
                      }}
                    >
                      Quitar
                    </button>
                  )}
                  {!isMe && !hasPairs && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px', fontSize: 11, flex: 'none' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMember(m.user_id);
                      }}
                    >
                      remover
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Total gasto no grupo</div>
          <div className="value num">{fmt(group.shared_expenses.reduce((s, e) => s + e.total_amount, 0))}</div>
          <div className="delta">{group.shared_expenses.length} despesa(s) registrada(s)</div>
        </div>
      </div>

      <div className="card">
        <h3>Despesas do grupo</h3>
        {group.shared_expenses.length === 0 && <div className="empty-hint">Nenhuma despesa nesse grupo ainda.</div>}
        {group.shared_expenses.map((e) => (
          <div className="expense-row" key={e.id} onClick={() => openEditExpense(e)} style={{ cursor: 'pointer' }}>
            <div className="expense-top">
              <div className="expense-left">
                <div className="expense-icon">🧾</div>
                <div>
                  <div className="expense-desc">{e.description}</div>
                  <div className="expense-meta">
                    pago por {e.paid_by.name} · {fmtDateShort(e.date)}
                  </div>
                </div>
              </div>
              <div className="expense-right">
                <div className="expense-total num">{fmt(e.total_amount)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SharedExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        expense={editingExpense}
        groupId={groupId}
        groupMembers={group.members}
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
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        groupId={groupId}
        friendUserId={settleTarget?.toUserId}
        counterpartyName={settleTarget?.name}
        suggestedAmount={settleTarget?.amount}
        onSaved={() => {
          setSettleTarget(null);
          load();
          reloadAll();
        }}
      />

      <RegisterReceiptModal
        open={!!receiptTarget}
        onClose={() => setReceiptTarget(null)}
        groupId={groupId}
        friendUserId={receiptTarget?.fromUserId}
        counterpartyName={receiptTarget?.name}
        suggestedAmount={receiptTarget?.amount}
        onSaved={() => {
          setReceiptTarget(null);
          load();
          reloadAll();
        }}
      />

      <MemberPairsModal
        open={!!pairsModalMember}
        onClose={() => setPairsModalMember(null)}
        memberName={pairsModalMember?.user?.name}
        pairs={pairsModalMember ? pairsForMember(pairsModalMember.user_id) : []}
        members={group.members}
        onSettle={(toUserId, amount, name) => {
          setPairsModalMember(null);
          settleWithMember(toUserId, amount, name);
        }}
        onReceive={(fromUserId, amount, name) => {
          setPairsModalMember(null);
          receiveFromMember(fromUserId, amount, name);
        }}
      />

      <AddGroupMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        groupId={groupId}
        candidates={memberCandidates}
        onAdded={() => {
          setAddMemberOpen(false);
          load();
        }}
      />

      <ConfirmDeleteModal
        open={deleteGroupOpen}
        onClose={() => setDeleteGroupOpen(false)}
        onConfirm={handleDeleteGroup}
        title="Excluir grupo"
        message="Tem certeza que deseja excluir este grupo? Esta ação não pode ser desfeita."
      />

      <GroupConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        simplified={group.simplify_debts}
        onToggleSimplified={toggleSimplified}
        deleteDisabled={group.members.some((m) => m.balance !== 0)}
        onDeleteGroup={() => {
          setConfigOpen(false);
          setDeleteGroupOpen(true);
        }}
      />
    </div>
  );
}
