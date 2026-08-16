import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { transactionsApi, recurringApi, installmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';

const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const INSTALLMENT_CUSTOM = 'custom';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionModal({ open, onClose, onCreated, onDeleted, transaction, installmentOnly = false }) {
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
  const [customInstallments, setCustomInstallments] = useState(false);
  const [recorrente, setRecorrente] = useState(false);
  const [autoDebit, setAutoDebit] = useState(true);
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
      setAmount(numberToMasked(transaction.amount));
      setDate(transaction.date);
      setCategoryId(transaction.category_id);
      setAccountRef(
        transaction.payment_method === 'credit' ? `credit:${transaction.account_id}` : `checking:${transaction.account_id}`
      );
      setInstallments(1);
      setCustomInstallments(false);
      setRecorrente(false);
      setAutoDebit(true);
      setEndDate('');
    } else {
      setTipo('despesa');
      setDescription('');
      setAmount('');
      setDate(todayIso());
      setInstallments(1);
      setCustomInstallments(false);
      setRecorrente(false);
      setAutoDebit(true);
      setEndDate('');
      setAccountRef(
        installmentOnly
          ? creditCardAccounts[0]
            ? `credit:${creditCardAccounts[0].id}`
            : ''
          : checkingAccounts[0]
          ? `checking:${checkingAccounts[0].id}`
          : ''
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, transaction, installmentOnly]);

  useEffect(() => {
    if (isEditing) return;
    setCategoryId(categories[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, categories.length]);

  const numericAmount = useMemo(() => maskToNumber(amount), [amount]);

  if (!open) return null;

  const isCreditAccountSelected = accountRef.startsWith('credit:');
  const isInstallment = isEditing && !!transaction.installment_plan_id;
  const isInstallmentConfirmed = isInstallment && transaction.status === 'confirmed';
  const isInvoicePayment = isEditing && !!transaction.is_invoice_payment;
  const isTransfer = isEditing && !!transaction.is_transfer;
  const canChangeAccount = !isEditing || (!isInstallment && !isInvoicePayment && !isTransfer);

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
    if (!isTransfer) {
      if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
      if (!isInvoicePayment && !categoryId) return setError('Selecione uma categoria.');
      if (!accountRef) return setError('Selecione uma conta ou cartão.');
      if (customInstallments && installments < 13) return setError('Informe a quantidade de parcelas.');
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const [, accId] = accountRef.split(':');
        await transactionsApi.update(transaction.id, {
          description: description.trim(),
          ...(isTransfer
            ? {}
            : {
                amount: numericAmount,
                date,
                ...(isInvoicePayment ? {} : { category_id: categoryId }),
                ...(canChangeAccount ? { account_id: accId } : {}),
              }),
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
          auto_debit: autoDebit,
          frequency: 'monthly',
          start_date: date,
          end_date: autoDebit ? endDate || null : null,
          auto_confirm: true,
        });
        showSuccess(autoDebit ? 'Débito automático criado com sucesso.' : 'Lembrete criado com sucesso.');
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
    installments > 1 && numericAmount > 0 ? `${installments}x de ${fmt(numericAmount / installments)}` : '';

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>
            {isEditing
              ? isTransfer
                ? 'Transferência entre contas'
                : 'Editar transação'
              : installmentOnly
              ? 'Nova compra parcelada'
              : 'Nova transação'}
          </h2>
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

          {!isEditing && !installmentOnly && (
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
              <CurrencyInput value={amount} onChange={setAmount} disabled={isTransfer} />
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isTransfer} />
            </div>
          </div>

          {isTransfer && (
            <div className="fatura-note show" style={{ background: 'var(--bg)', color: 'var(--ink-soft)' }}>
              Esta é uma transferência entre contas — não afeta receitas ou despesas. Para corrigir valor, data ou
              contas, exclua e crie uma nova transferência.
            </div>
          )}

          {!isInvoicePayment && !isTransfer && (
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
          )}

          {!isTransfer && (!isEditing || canChangeAccount) && (
            <div className="field">
              <label>{installmentOnly ? 'Cartão' : 'Conta / Cartão'}</label>
              <select value={accountRef} onChange={(e) => setAccountRef(e.target.value)}>
                {!installmentOnly && (
                  <optgroup label="Contas correntes">
                    {checkingAccounts.map((a) => (
                      <option key={a.id} value={`checking:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(installmentOnly || tipo === 'despesa') && (
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
              <label>Parcelar em</label>
              {customInstallments ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    placeholder="Quantidade"
                    value={installments === 1 ? '' : installments}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      setInstallments(v === '' ? 1 : Math.min(999, Number(v)));
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      setCustomInstallments(false);
                      setInstallments(1);
                    }}
                  >
                    Usar lista
                  </button>
                </div>
              ) : (
                <select
                  value={installments}
                  onChange={(e) => {
                    if (e.target.value === INSTALLMENT_CUSTOM) {
                      setCustomInstallments(true);
                      setInstallments(13);
                      return;
                    }
                    setInstallments(Number(e.target.value));
                  }}
                >
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? '1x (à vista)' : `${n}x`}
                    </option>
                  ))}
                  <option value={INSTALLMENT_CUSTOM}>+ parcela (mais de 12x)</option>
                </select>
              )}
              {parcelaPreview && (
                <div
                  className="fatura-note show"
                  style={{ background: 'var(--teal-soft)', color: 'var(--teal)', marginTop: 8 }}
                >
                  {parcelaPreview}
                </div>
              )}
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
            <div className="recorrente-row">
              <div className={`toggle${autoDebit ? ' on' : ''}`} onClick={() => setAutoDebit((v) => !v)} />
              <span>Descontar automaticamente</span>
            </div>
          )}

          {!isEditing && recorrente && !isCreditAccountSelected && autoDebit && (
            <div className="field">
              <label>Repetir até (opcional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
              : isTransfer
              ? 'Esta é uma transferência entre contas. Excluir vai remover o lançamento nas duas contas. Esta ação não pode ser desfeita.'
              : 'Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.'
          }
        />
      )}
    </ModalShell>
  );
}
