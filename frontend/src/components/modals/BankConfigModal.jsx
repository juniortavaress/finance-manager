import { useEffect, useState } from 'react';
import { banksApi, accountsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const COLOR_OPTIONS = [
  '#0F5C5C',
  '#C0912F',
  '#A6432C',
  '#7A4FE0',
  '#3D7A8C',
  '#D97757',
  '#8B9A97',
  '#1C2B29',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Modal unico para criar OU editar um banco.
 * Se `bank` for passado, edita (e permite excluir); senao, cria um banco novo com contas checking/credit_card/investment.
 */
export default function BankConfigModal({ open, onClose, onSaved, bank, creditCardAccount }) {
  const isEditing = !!bank;
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState(5);
  const [dueDay, setDueDay] = useState(15);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setUsage(null);
    if (isEditing) {
      setName(bank.name);
      setColor(bank.color_hex);
      setCreditLimit(creditCardAccount?.credit_card ? String(creditCardAccount.credit_card.credit_limit) : '');
      setClosingDay(creditCardAccount?.credit_card?.closing_day ?? 5);
      setDueDay(creditCardAccount?.credit_card?.due_day ?? 15);
      setOpeningBalance('');
    } else {
      setName('');
      setColor(COLOR_OPTIONS[0]);
      setOpeningBalance('');
      setCreditLimit('');
      setClosingDay(5);
      setDueDay(15);
    }
  }, [open, isEditing, bank, creditCardAccount]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Informe o nome do banco.');
    if (Number(closingDay) === Number(dueDay)) {
      return setError('Dia de fechamento e vencimento devem ser diferentes.');
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await banksApi.update(bank.id, { name: name.trim(), color_hex: color });
        if (creditCardAccount) {
          await accountsApi.update(creditCardAccount.id, {
            credit_card: {
              credit_limit: parseFloat((creditLimit || '0').toString().replace(/[^\d,.-]/g, '').replace(',', '.')) || 0,
              closing_day: Number(closingDay),
              due_day: Number(dueDay),
            },
          });
        }
      } else {
        const { bank: newBank } = await banksApi.create({ name: name.trim(), color_hex: color });

        const balance = parseFloat((openingBalance || '0').toString().replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
        const limit = parseFloat((creditLimit || '0').toString().replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;

        await accountsApi.create({
          bank_id: newBank.id,
          type: 'checking',
          name: `Conta corrente ${newBank.name}`,
          opening_balance: balance,
          opening_balance_date: todayIso(),
        });

        await accountsApi.create({
          bank_id: newBank.id,
          type: 'credit_card',
          name: `Cartão ${newBank.name}`,
          credit_card: { credit_limit: limit, closing_day: Number(closingDay), due_day: Number(dueDay) },
        });

        await accountsApi.create({
          bank_id: newBank.id,
          type: 'investment',
          name: `Investimentos ${newBank.name}`,
        });
      }

      showSuccess(isEditing ? 'Banco atualizado com sucesso.' : 'Banco criado com sucesso.');
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o banco.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function openDeleteModal() {
    setDeleteModalOpen(true);
    setCheckingUsage(true);
    try {
      const res = await banksApi.usage(bank.id);
      setUsage(res);
    } catch (err) {
      showError(err.message || 'Não foi possível verificar o uso do banco.');
      setDeleteModalOpen(false);
    } finally {
      setCheckingUsage(false);
    }
  }

  async function handleDelete() {
    await banksApi.archive(bank.id);
    showSuccess('Banco excluído com sucesso.');
    setDeleteModalOpen(false);
    onSaved?.();
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar banco' : 'Novo banco'}</h2>
          <div className="modal-head-actions">
            {isEditing && (
              <button type="button" className="modal-delete-trigger" title="Excluir" onClick={openDeleteModal}>
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
            <label>Nome do banco</label>
            <input type="text" placeholder="Ex.: Itaú, Nubank..." value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label>Cor de identificação</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    cursor: 'pointer',
                    border: color === c ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: color === c ? '0 0 0 2px var(--surface)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {!isEditing && (
            <div className="field">
              <label>Saldo inicial da conta corrente</label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>Limite do cartão</label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Fechamento da fatura (dia)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Vencimento da fatura (dia)</label>
              <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar banco'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir banco"
          loading={checkingUsage}
          message={
            usage?.total > 0
              ? `Isso vai apagar definitivamente ${usage.total} registro(s) (transações, faturas e parcelamentos) vinculados a este banco. Esta ação não pode ser desfeita.`
              : 'Tem certeza? Este banco e suas contas serão apagados definitivamente. Esta ação não pode ser desfeita.'
          }
        />
      )}
    </ModalShell>
  );
}
