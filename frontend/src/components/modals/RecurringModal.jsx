import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { recurringApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RecurringModal({ open, onClose, onCreated, onDeleted, recurring }) {
  const { checkingAccounts, creditCardAccounts, expenseCategories } = useData();
  const { showSuccess, showError } = useToast();
  const isEditing = !!recurring;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [categoryId, setCategoryId] = useState('');
  const [accountRef, setAccountRef] = useState(''); // "checking:<id>" ou "credit:<id>"
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [autoDebit, setAutoDebit] = useState(true);
  const [editScope, setEditScope] = useState('current_and_future');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isCreditSelected = accountRef.startsWith('credit:');

  useEffect(() => {
    if (!open) return;
    setError('');
    setEditScope('current_and_future');
    if (isEditing) {
      setDescription(recurring.description);
      setAmount(numberToMasked(recurring.amount));
      setDayOfMonth(recurring.day_of_month || 5);
      setFrequency(recurring.frequency);
      setStartDate(recurring.start_date);
      setEndDate(recurring.end_date || '');
      setCategoryId(recurring.category_id);
      setAutoDebit(recurring.auto_debit !== false);
      setAccountRef(
        recurring.payment_method === 'credit' ? `credit:${recurring.account_id}` : `checking:${recurring.account_id}`
      );
    } else {
      setDescription('');
      setAmount('');
      setDayOfMonth(5);
      setFrequency('monthly');
      setStartDate(todayIso());
      setEndDate('');
      setAutoDebit(true);
      setCategoryId(expenseCategories[0]?.id || '');
      setAccountRef(checkingAccounts[0] ? `checking:${checkingAccounts[0].id}` : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, recurring]);

  if (!open) return null;

  const originalAccountRef = isEditing
    ? recurring.payment_method === 'credit'
      ? `credit:${recurring.account_id}`
      : `checking:${recurring.account_id}`
    : null;
  const structuralFieldsChanged =
    isEditing &&
    autoDebit &&
    (accountRef !== originalAccountRef || frequency !== recurring.frequency || startDate !== recurring.start_date);

  async function handleDelete() {
    await recurringApi.remove(recurring.id);
    showSuccess('Recorrente excluído com sucesso.');
    setDeleteModalOpen(false);
    onDeleted?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const numericAmount = maskToNumber(amount);

    const numericDay = Number(dayOfMonth);

    if (!description.trim()) return setError('Informe uma descrição.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!categoryId) return setError('Selecione uma categoria.');
    if (!accountRef) return setError('Selecione uma conta ou cartão.');
    if (!autoDebit && isCreditSelected) return setError('Descontar manual não pode ser no cartão de crédito.');
    if (!dayOfMonth || numericDay < 1 || numericDay > 31) return setError('Informe um dia válido (1 a 31).');

    setSubmitting(true);
    try {
      if (isEditing) {
        const payload = {
          description: description.trim(),
          amount: numericAmount,
          category_id: categoryId,
          day_of_month: numericDay,
          auto_debit: autoDebit,
        };
        payload.end_date = endDate || null;
        if (structuralFieldsChanged) {
          const [, accId] = accountRef.split(':');
          payload.account_id = accId;
          payload.payment_method = isCreditSelected ? 'credit' : 'debit';
          payload.frequency = frequency;
          if (editScope === 'current_and_future') {
            payload.start_date = startDate;
          }
          payload.edit_scope = editScope;
        }
        await recurringApi.update(recurring.id, payload);
        showSuccess('Recorrente atualizado com sucesso.');
      } else {
        const [, accId] = accountRef.split(':');
        await recurringApi.create({
          description: description.trim(),
          amount: numericAmount,
          type: 'expense',
          account_id: accId,
          category_id: categoryId,
          payment_method: isCreditSelected ? 'credit' : 'debit',
          auto_debit: autoDebit,
          frequency,
          day_of_month: numericDay,
          start_date: startDate,
          end_date: endDate || null,
        });
        showSuccess('Recorrente criado com sucesso.');
      }
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o recorrente.';
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
          <h2>{isEditing ? 'Editar recorrente' : 'Novo recorrente'}</h2>
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
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Descrição</label>
            <input
              type="text"
              placeholder="Ex.: Aluguel, Netflix, Academia..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Valor</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div className="field">
              <label>{autoDebit ? 'Dia da cobrança' : 'Dia de vencimento'}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={dayOfMonth}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  if (v === '') return setDayOfMonth('');
                  setDayOfMonth(Math.min(31, Number(v)));
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Conta / Cartão</label>
            <select value={accountRef} onChange={(e) => setAccountRef(e.target.value)}>
              <optgroup label="Contas correntes">
                {checkingAccounts.map((a) => (
                  <option key={a.id} value={`checking:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              {autoDebit && (
                <optgroup label="Cartões de crédito">
                  {creditCardAccounts.map((a) => (
                    <option key={a.id} value={`credit:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="field">
            <label>Frequência</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="monthly">Mensal</option>
              <option value="weekly">Semanal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>

          <div className="field-row">
            {(!isEditing || editScope === 'current_and_future') && (
              <div className="field">
                <label>Início</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label>Fim (opcional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="sem data final"
              />
            </div>
          </div>

          {isEditing && structuralFieldsChanged && (
            <div className="field">
              <label>Aplicar mudança de conta/cartão, frequência ou início</label>
              <div className="seg">
                <div
                  className={`seg-opt${editScope === 'current_and_future' ? ' active' : ''}`}
                  onClick={() => setEditScope('current_and_future')}
                >
                  Atual e seguintes
                </div>
                <div
                  className={`seg-opt${editScope === 'future_only' ? ' active' : ''}`}
                  onClick={() => setEditScope('future_only')}
                >
                  Só futuras
                </div>
              </div>
              <div className="fatura-note show" style={{ marginTop: 8 }}>
                {editScope === 'current_and_future'
                  ? 'A ocorrência deste mês (se já existir) também será movida para a nova conta/cartão.'
                  : 'A ocorrência deste mês não muda; a mudança vale a partir da próxima.'}
              </div>
            </div>
          )}

          <div className="recorrente-row">
            <div className={`toggle${autoDebit ? ' on' : ''}`} onClick={() => setAutoDebit((v) => !v)} />
            <span>Descontar automaticamente</span>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar recorrente'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir recorrente"
          message="Excluir este recorrente? As transações já confirmadas continuam no histórico; as futuras agendadas serão removidas. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
