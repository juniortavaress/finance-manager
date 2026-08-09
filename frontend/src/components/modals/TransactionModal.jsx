import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { transactionsApi, recurringApi, installmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 6, 10, 12];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionModal({ open, onClose, onCreated, onDeleted, transaction }) {
  const { checkingAccounts, creditCardAccounts, expenseCategories, incomeCategories } = useData();
  const { showSuccess, showError } = useToast();
  const isEditing = !!transaction;

  const [tipo, setTipo] = useState('despesa');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState('');
  const [accountRef, setAccountRef] = useState(''); // "checking:<id>" ou "credit:<id>"
  const [installments, setInstallments] = useState(1);
  const [recorrente, setRecorrente] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const categories = tipo === 'despesa' ? expenseCategories : incomeCategories;

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setTipo(transaction.type === 'income' ? 'receita' : 'despesa');
      setDescription(transaction.description);
      setAmount(String(transaction.amount));
      setDate(transaction.date);
      setCategoryId(transaction.category_id);
      setAccountRef(
        transaction.payment_method === 'credit' ? `credit:${transaction.account_id}` : `checking:${transaction.account_id}`
      );
      setInstallments(1);
      setRecorrente(false);
      setEndDate('');
    } else {
      setTipo('despesa');
      setDescription('');
      setAmount('');
      setDate(todayIso());
      setInstallments(1);
      setRecorrente(false);
      setEndDate('');
      setAccountRef(checkingAccounts[0] ? `checking:${checkingAccounts[0].id}` : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, transaction]);

  useEffect(() => {
    if (isEditing) return;
    setCategoryId(categories[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, categories.length]);

  const numericAmount = useMemo(() => {
    const cleaned = (amount || '').toString().replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }, [amount]);

  if (!open) return null;

  const isCreditAccountSelected = accountRef.startsWith('credit:');
  const isInstallment = isEditing && !!transaction.installment_plan_id;
  const isInstallmentConfirmed = isInstallment && transaction.status === 'confirmed';

  async function handleDelete() {
    if (isInstallment) {
      await installmentsApi.cancelFrom(transaction.installment_plan_id, transaction.installment_number);
      showSuccess('Parcelas canceladas com sucesso.');
    } else {
      await transactionsApi.remove(transaction.id);
      showSuccess('Transação excluída com sucesso.');
    }
    setDeleteModalOpen(false);
    onDeleted?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!description.trim()) return setError('Informe uma descrição.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!categoryId) return setError('Selecione uma categoria.');
    if (!accountRef) return setError('Selecione uma conta ou cartão.');

    setSubmitting(true);
    try {
      if (isEditing) {
        await transactionsApi.update(transaction.id, {
          description: description.trim(),
          amount: numericAmount,
          date,
          category_id: categoryId,
        });
        showSuccess('Transação atualizada com sucesso.');
      } else if (recorrente) {
        const [, accId] = accountRef.split(':');
        await recurringApi.create({
          description: description.trim(),
          amount: numericAmount,
          type: tipo === 'despesa' ? 'expense' : 'income',
          account_id: accId,
          category_id: categoryId,
          payment_method: 'debit',
          frequency: 'monthly',
          start_date: date,
          end_date: endDate || null,
          auto_confirm: true,
        });
        showSuccess('Débito automático criado com sucesso.');
      } else {
        const [, accId] = accountRef.split(':');
        const paymentMethod = isCreditAccountSelected ? 'credit' : 'debit';
        await transactionsApi.create({
          description: description.trim(),
          amount: numericAmount,
          type: tipo === 'despesa' ? 'expense' : 'income',
          account_id: accId,
          category_id: categoryId,
          date,
          payment_method: paymentMethod,
          installments_count: paymentMethod === 'credit' ? installments : 1,
        });
        showSuccess('Transação criada com sucesso.');
      }
      onCreated?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar a transação.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const parcelaPreview =
    installments > 1 && numericAmount > 0
      ? `${installments}x de ${fmt(numericAmount / installments)} · aparece como um novo parcelamento na aba Parcelas.`
      : 'Cobrado integralmente na próxima fatura.';

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar transação' : 'Nova transação'}</h2>
          <div className="modal-head-actions">
            {isEditing && (
              <button
                type="button"
                className="modal-delete-trigger"
                title={isInstallmentConfirmed ? 'Parcela já confirmada não pode ser excluída isoladamente' : 'Excluir'}
                disabled={isInstallmentConfirmed}
                onClick={() => setDeleteModalOpen(true)}
              >
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

          {!isEditing && (
            <div className="field">
              <div className="seg">
                <div
                  className={`seg-opt despesa${tipo === 'despesa' ? ' active' : ''}`}
                  onClick={() => setTipo('despesa')}
                >
                  ↓ Despesa
                </div>
                <div
                  className={`seg-opt receita${tipo === 'receita' ? ' active' : ''}`}
                  onClick={() => setTipo('receita')}
                >
                  ↑ Receita
                </div>
              </div>
            </div>
          )}

          <div className="field">
            <label>Descrição</label>
            <input
              type="text"
              placeholder="Ex.: Supermercado, Salário, Uber..."
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
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {!isEditing && (
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
                {tipo === 'despesa' && (
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
          )}

          {!isEditing && isCreditAccountSelected && tipo === 'despesa' && (
            <div className="field">
              <div className="fatura-note show">
                Esta despesa será somada à fatura do cartão selecionado.
              </div>
              <div style={{ marginTop: 14 }}>
                <label>Parcelar em</label>
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? '1x (à vista)' : `${n}x`}
                    </option>
                  ))}
                </select>
                <div
                  className="fatura-note show"
                  style={{ background: 'var(--teal-soft)', color: 'var(--teal)', marginTop: 8 }}
                >
                  {parcelaPreview}
                </div>
              </div>
            </div>
          )}

          {!isEditing && !isCreditAccountSelected && (
            <div className="recorrente-row">
              <div
                className={`toggle${recorrente ? ' on' : ''}`}
                onClick={() => setRecorrente((v) => !v)}
              />
              <span>Transação recorrente (repete todo mês)</span>
            </div>
          )}

          {!isEditing && recorrente && !isCreditAccountSelected && (
            <div className="field">
              <label>Repetir até (opcional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}

          {isEditing && transaction.installment_plan_id && (
            <div className="fatura-note show" style={{ background: 'var(--bg)', color: 'var(--ink-faint)' }}>
              Esta transação faz parte de um parcelamento. Conta, cartão e parcelamento não podem ser alterados aqui —
              use a aba Parcelas para adiantar ou cancelar parcelas.
            </div>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar transação'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir transação"
          confirmLabel={isInstallment ? 'Excluir esta e as seguintes' : 'Excluir'}
          message={
            isInstallment
              ? `Esta transação faz parte de um parcelamento. Cancelar a parcela ${transaction.installment_number} e as seguintes? Esta ação não pode ser desfeita.`
              : 'Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.'
          }
        />
      )}
    </ModalShell>
  );
}
