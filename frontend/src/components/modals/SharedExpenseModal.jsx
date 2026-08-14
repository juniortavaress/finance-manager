import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { sharedExpensesApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { splitEqualPreview } from '../../utils/split';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';
import ParticipantPicker from '../ParticipantPicker';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Modal de despesa dividida. Quando `groupId` e passado (aberta de dentro de
 * um grupo), o campo "Grupo (opcional)" nao aparece -- contexto ja e implicito.
 * Quando aberta a partir de Amigos, mostra o seletor de grupo/avulsa e troca o
 * pool de participantes conforme a escolha.
 */
export default function SharedExpenseModal({
  open,
  onClose,
  onSaved,
  onDeleted,
  expense,
  groupId,
  groupMembers,
  friendUserId,
  friendName,
  groups = [],
}) {
  const { user } = useAuth();
  const { friends, checkingAccounts } = useData();
  const { showSuccess, showError } = useToast();
  const isEditing = !!expense;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [paidById, setPaidById] = useState(user?.id);
  const [selectedGroupId, setSelectedGroupId] = useState(groupId || '');
  const [participantIds, setParticipantIds] = useState([]);
  const [splitMode, setSplitMode] = useState('equal');
  const [customValues, setCustomValues] = useState({});
  const [payerAccountId, setPayerAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const showGroupSelector = !groupId;

  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const withYouLabel = (person) =>
    String(person.id) === String(user?.id) ? { ...person, name: `${person.name} (você)` } : person;

  const candidates = useMemo(() => {
    if (groupId && groupMembers) {
      return groupMembers.map((m) => withYouLabel(m.user));
    }
    if (selectedGroupId && activeGroup) {
      return (activeGroup.members || []).map((m) => withYouLabel(m.user));
    }
    if (friendUserId) {
      return [{ id: user?.id, name: `${user?.name} (você)` }, { id: friendUserId, name: friendName }];
    }
    return [
      { id: user?.id, name: `${user?.name} (você)` },
      ...friends.map((f) => ({ id: f.id, name: f.name })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, groupMembers, selectedGroupId, activeGroup, friendUserId, friendName, friends, user]);

  // Despesa avulsa: o pagador só pode ser um dos participantes já escolhidos
  // (evita marcar como pagador alguém fora da dívida). Em grupo, qualquer
  // membro pode ser pagador mesmo antes de estar na lista de participantes.
  const payerCandidates =
    showGroupSelector && !selectedGroupId && !friendUserId
      ? candidates.filter((c) => participantIds.some((id) => String(id) === String(c.id)))
      : candidates;

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setDescription(expense.description);
      setAmount(numberToMasked(expense.total_amount));
      setDate(expense.date);
      setPaidById(expense.paid_by_id);
      setSelectedGroupId(expense.group_id || '');
      setSplitMode(expense.split_mode);
      setParticipantIds(expense.participants.map((p) => p.user_id));
      const values = {};
      expense.participants.forEach((p) => {
        values[p.user_id] = numberToMasked(p.share_amount);
      });
      setCustomValues(values);
      setPayerAccountId('');
    } else {
      setDescription('');
      setAmount('');
      setDate(todayIso());
      setPaidById(user?.id);
      setSelectedGroupId(groupId || '');
      setSplitMode('equal');
      setCustomValues({});
      setPayerAccountId(checkingAccounts[0]?.id || '');
      const initialIds = groupId && groupMembers ? groupMembers.map((m) => m.user_id) : friendUserId ? [user?.id, friendUserId] : [];
      setParticipantIds(initialIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, expense, groupId, friendUserId]);

  const numericAmount = useMemo(() => maskToNumber(amount), [amount]);
  const isPaidByMe = String(paidById) === String(user?.id);

  useEffect(() => {
    if (!open) return;
    if (payerCandidates.length === 0) return;
    if (!payerCandidates.some((c) => String(c.id) === String(paidById))) {
      setPaidById(payerCandidates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payerCandidates.map((c) => c.id).join(',')]);

  const equalPreview = useMemo(
    () => splitEqualPreview(numericAmount, participantIds),
    [numericAmount, participantIds]
  );

  if (!open) return null;

  function toggleParticipants(ids) {
    setParticipantIds(ids);
  }

  async function handleDelete() {
    await sharedExpensesApi.remove(expense.id);
    showSuccess('Despesa excluída com sucesso.');
    setDeleteModalOpen(false);
    onDeleted?.();
  }

  // Despesa avulsa (sem grupo selecionado, sem friendUserId fixo): o "amigo" da
  // dívida e inferido dos participantes escolhidos, nao de um seletor a parte --
  // precisa ser exatamente eu + 1 amigo.
  const inferredFriendId =
    showGroupSelector && !selectedGroupId && !friendUserId
      ? participantIds.find((id) => String(id) !== String(user?.id))
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!description.trim()) return setError('Informe uma descrição.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (participantIds.length === 0) return setError('Selecione ao menos um participante.');

    const isStandaloneExpense = showGroupSelector && !selectedGroupId && !friendUserId;
    if (isStandaloneExpense) {
      const others = participantIds.filter((id) => String(id) !== String(user?.id));
      if (others.length === 0) return setError('Selecione com qual amigo a despesa é dividida.');
      if (others.length > 1) return setError('Despesa avulsa (sem grupo) só pode ser dividida com um amigo por vez — para mais pessoas, crie um grupo.');
    }

    let participantsPayload;
    if (splitMode === 'equal') {
      participantsPayload = participantIds.map((id) => ({ user_id: id }));
    } else if (splitMode === 'value') {
      participantsPayload = participantIds.map((id) => ({ user_id: id, value: maskToNumber(customValues[id] || '') }));
    } else {
      participantsPayload = participantIds.map((id) => ({
        user_id: id,
        percentage: Number(String(customValues[id] || '0').replace(',', '.')),
      }));
    }

    const payload = {
      description: description.trim(),
      total_amount: numericAmount,
      date,
      paid_by_id: paidById,
      split_mode: splitMode,
      participants: participantsPayload,
      ...(isPaidByMe && payerAccountId ? { payer_account_id: payerAccountId } : {}),
      ...(groupId
        ? { group_id: groupId }
        : selectedGroupId
        ? { group_id: selectedGroupId }
        : { friend_user_id: friendUserId || inferredFriendId }),
    };

    setSubmitting(true);
    try {
      if (isEditing) {
        await sharedExpensesApi.update(expense.id, {
          description: payload.description,
          total_amount: payload.total_amount,
          date: payload.date,
          split_mode: payload.split_mode,
          participants: payload.participants,
        });
        showSuccess('Despesa atualizada com sucesso.');
      } else {
        await sharedExpensesApi.create(payload);
        showSuccess('Despesa criada com sucesso.');
      }
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar a despesa.';
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
          <h2>{isEditing ? 'Editar despesa' : 'Nova despesa dividida'}</h2>
          <div className="modal-head-actions">
            {isEditing && (
              <button type="button" className="modal-delete-trigger" title="Excluir" onClick={() => setDeleteModalOpen(true)}>
                <IconTrash />
              </button>
            )}
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-body-scroll">
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Descrição</label>
            <input
              type="text"
              placeholder="Ex.: Jantar, Airbnb, Uber..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Valor total</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {showGroupSelector && !friendUserId && (
            <div className="field">
              <label>Grupo (opcional)</label>
              <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                <option value="">Nenhum — despesa avulsa</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label>Envolvidos</label>
            <ParticipantPicker candidates={candidates} selectedIds={participantIds} onChange={toggleParticipants} />
          </div>

          <div className="field">
            <label>Pago por</label>
            <select value={paidById} onChange={(e) => setPaidById(e.target.value)}>
              {payerCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <div className="seg seg-3">
              <div className={`seg-opt${splitMode === 'equal' ? ' active' : ''}`} onClick={() => setSplitMode('equal')}>
                Igualmente
              </div>
              <div className={`seg-opt${splitMode === 'value' ? ' active' : ''}`} onClick={() => setSplitMode('value')}>
                Por valores
              </div>
              <div className={`seg-opt${splitMode === 'percentage' ? ' active' : ''}`} onClick={() => setSplitMode('percentage')}>
                Por %
              </div>
            </div>
          </div>

          {participantIds.length > 0 && (
            <div className="field split-preview-box">
              {participantIds.map((id) => {
                const person = candidates.find((c) => String(c.id) === String(id));
                return (
                  <div className="split-row" key={id}>
                    <div className="split-left">
                      <span className="split-name">{person?.name || '—'}</span>
                    </div>
                    {splitMode === 'equal' ? (
                      <span className="split-val num">{fmt(equalPreview[id] || 0)}</span>
                    ) : splitMode === 'value' ? (
                      <span className="split-val">
                        <CurrencyInput
                          value={customValues[id] || ''}
                          onChange={(v) => setCustomValues((prev) => ({ ...prev, [id]: v }))}
                        />
                      </span>
                    ) : (
                      <span className="split-val">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0%"
                          value={customValues[id] || ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({ ...prev, [id]: e.target.value.replace(/[^\d,.]/g, '') }))
                          }
                        />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isPaidByMe && (
            <div className="field">
              <label>Conta de saída (opcional)</label>
              <select value={payerAccountId} onChange={(e) => setPayerAccountId(e.target.value)}>
                <option value="">Não vincular a uma conta agora</option>
                {checkingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          </div>
          <div className="modal-actions modal-actions-footer">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar despesa'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir despesa"
          message="Tem certeza que deseja excluir esta despesa? Se houver transação vinculada, ela também será removida. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
