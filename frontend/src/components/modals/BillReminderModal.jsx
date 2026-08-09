import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { remindersApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';

export default function BillReminderModal({ open, onClose, onCreated, onDeleted, reminder }) {
  const { checkingAccounts, creditCardAccounts, expenseCategories } = useData();
  const { showSuccess, showError } = useToast();
  const isEditing = !!reminder;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const allAccounts = [...checkingAccounts, ...creditCardAccounts];

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setDescription(reminder.description);
      setAmount(String(reminder.amount));
      setDayOfMonth(reminder.day_of_month);
      setCategoryId(reminder.category_id);
      setAccountId(reminder.account_id);
    } else {
      setDescription('');
      setAmount('');
      setDayOfMonth(5);
      setCategoryId(expenseCategories[0]?.id || '');
      setAccountId(allAccounts[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, reminder]);

  if (!open) return null;

  async function handleDelete() {
    await remindersApi.remove(reminder.id);
    showSuccess('Lembrete excluído com sucesso.');
    setDeleteModalOpen(false);
    onDeleted?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const numericAmount = parseFloat((amount || '').toString().replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;

    if (!description.trim()) return setError('Informe uma descrição.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!categoryId) return setError('Selecione uma categoria.');
    if (!accountId) return setError('Selecione uma conta ou cartão.');

    setSubmitting(true);
    try {
      if (isEditing) {
        await remindersApi.update(reminder.id, {
          description: description.trim(),
          amount: numericAmount,
          category_id: categoryId,
          day_of_month: dayOfMonth,
        });
        showSuccess('Lembrete atualizado com sucesso.');
      } else {
        await remindersApi.create({
          description: description.trim(),
          amount: numericAmount,
          account_id: accountId,
          category_id: categoryId,
          day_of_month: dayOfMonth,
        });
        showSuccess('Lembrete criado com sucesso.');
      }
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o lembrete.';
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
          <h2>{isEditing ? 'Editar lembrete' : 'Novo lembrete'}</h2>
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
              placeholder="Ex.: Aluguel, Internet, Condomínio..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Valor</label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Dia de vencimento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
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
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <optgroup label="Contas correntes">
                {checkingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cartões de crédito">
                {creditCardAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar lembrete'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir lembrete"
          message="Excluir este lembrete? O histórico de transações já criadas ao marcar como pago continua intacto. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
