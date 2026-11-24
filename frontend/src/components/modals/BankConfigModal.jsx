import { useEffect, useState } from 'react';
import { banksApi, accountsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked, CURRENCY_OPTIONS } from '../../utils/currency';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';
import { localIsoDate } from '../../utils/date';
import { useFormError } from '../../hooks/useFormError';

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

const ACCOUNT_KINDS = [
  { key: 'checking', title: 'Conta corrente', hint: 'Saldo e extrato' },
  { key: 'credit_card', title: 'Cartão de crédito', hint: 'Faturas e limite' },
  { key: 'investment', title: 'Investimento', hint: 'Caixa e ativos' },
];

const ACCOUNT_NAME_PREFIX = {
  checking: 'Conta corrente',
  credit_card: 'Cartão',
  investment: 'Investimentos',
};

function clampDay(raw) {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? '' : String(Math.min(31, Number(digits)));
}

/**
 * Modal unico para criar OU editar um banco.
 * Cada banco tem apenas as contas ligadas aqui (corrente, cartao e/ou investimento).
 */
export default function BankConfigModal({
  open,
  onClose,
  onSaved,
  bank,
  creditCardAccount,
  checkingAccount,
  investmentAccount,
}) {
  const isEditing = !!bank;
  const { showSuccess, showError } = useToast();
  const existing = { checking: checkingAccount, credit_card: creditCardAccount, investment: investmentAccount };

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [currency, setCurrency] = useState('BRL');
  const [enabled, setEnabled] = useState({ checking: true, credit_card: false, investment: false });
  const [openingBalance, setOpeningBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState('5');
  const [dueDay, setDueDay] = useState('15');
  const [, setError] = useFormError();
  const [submitting, setSubmitting] = useState(false);
  const [verifyingKind, setVerifyingKind] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setUsage(null);
    setOpeningBalance('');
    if (isEditing) {
      setName(bank.name);
      setColor(bank.color_hex);
      setCurrency((checkingAccount || creditCardAccount || investmentAccount)?.currency || 'BRL');
      setEnabled({ checking: !!checkingAccount, credit_card: !!creditCardAccount, investment: !!investmentAccount });
      setCreditLimit(creditCardAccount?.credit_card ? numberToMasked(creditCardAccount.credit_card.credit_limit) : '');
      setClosingDay(String(creditCardAccount?.credit_card?.closing_day ?? 5));
      setDueDay(String(creditCardAccount?.credit_card?.due_day ?? 15));
    } else {
      setName('');
      setColor(COLOR_OPTIONS[0]);
      setCurrency('BRL');
      setEnabled({ checking: true, credit_card: false, investment: false });
      setCreditLimit('');
      setClosingDay('5');
      setDueDay('15');
    }
  }, [open, isEditing, bank, creditCardAccount, checkingAccount, investmentAccount]);

  if (!open) return null;

  async function toggleKind(kind) {
    if (!enabled[kind]) {
      setEnabled((prev) => ({ ...prev, [kind]: true }));
      return;
    }
    const account = existing[kind];
    if (account) {
      setVerifyingKind(kind);
      try {
        const { total } = await accountsApi.usage(account.id);
        if (total > 0) {
          showError('Esta conta tem movimentações e não pode ser removida.');
          return;
        }
      } catch (err) {
        showError(err.message || 'Não foi possível verificar o uso da conta.');
        return;
      } finally {
        setVerifyingKind(null);
      }
    }
    setEnabled((prev) => ({ ...prev, [kind]: false }));
  }

  function validate() {
    if (!name.trim()) return 'Informe o nome do banco.';
    if (!ACCOUNT_KINDS.some(({ key }) => enabled[key])) return 'Escolha pelo menos um tipo de conta.';
    if (enabled.credit_card) {
      if (!closingDay || !dueDay) return 'Informe os dias de fechamento e vencimento.';
      if (Number(closingDay) === Number(dueDay)) return 'Dia de fechamento e vencimento devem ser diferentes.';
    }
    return '';
  }

  async function createAccount(bankId, bankName, kind) {
    const base = { bank_id: bankId, type: kind, name: `${ACCOUNT_NAME_PREFIX[kind]} ${bankName}`, currency };
    if (kind === 'checking') {
      return accountsApi.create({
        ...base,
        opening_balance: maskToNumber(openingBalance),
        opening_balance_date: localIsoDate(),
      });
    }
    if (kind === 'credit_card') {
      return accountsApi.create({
        ...base,
        credit_card: {
          credit_limit: maskToNumber(creditLimit),
          closing_day: Number(closingDay),
          due_day: Number(dueDay),
        },
      });
    }
    return accountsApi.create(base);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);

    setError('');
    setSubmitting(true);
    try {
      if (isEditing) {
        await banksApi.update(bank.id, { name: name.trim(), color_hex: color });
        const currencyChanged = currency !== (checkingAccount || creditCardAccount || investmentAccount)?.currency;

        for (const { key } of ACCOUNT_KINDS) {
          const account = existing[key];
          if (account && !enabled[key]) {
            await accountsApi.archive(account.id);
          } else if (!account && enabled[key]) {
            await createAccount(bank.id, name.trim(), key);
          } else if (account && currencyChanged) {
            await accountsApi.update(account.id, { currency });
          }
        }
        if (creditCardAccount && enabled.credit_card) {
          await accountsApi.update(creditCardAccount.id, {
            credit_card: {
              credit_limit: maskToNumber(creditLimit),
              closing_day: Number(closingDay),
              due_day: Number(dueDay),
            },
          });
        }
      } else {
        const { bank: newBank } = await banksApi.create({ name: name.trim(), color_hex: color });
        for (const { key } of ACCOUNT_KINDS) {
          if (enabled[key]) await createAccount(newBank.id, newBank.name, key);
        }
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

  function renderFields(kind) {
    if (!enabled[kind]) return null;
    if (kind === 'checking' && !checkingAccount) {
      return (
        <div className="bank-cfg-fields">
          <div className="field">
            <label>Saldo inicial</label>
            <CurrencyInput value={openingBalance} onChange={setOpeningBalance} />
          </div>
        </div>
      );
    }
    if (kind === 'credit_card') {
      return (
        <div className="bank-cfg-fields">
          <div className="field">
            <label>Limite</label>
            <CurrencyInput value={creditLimit} onChange={setCreditLimit} />
          </div>
          <div className="field">
            <label>Fecha dia</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={closingDay}
              onChange={(e) => setClosingDay(clampDay(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Vence dia</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={dueDay}
              onChange={(e) => setDueDay(clampDay(e.target.value))}
            />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <h2>{isEditing ? 'Configurar banco' : 'Novo banco'}</h2>
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

          <div className="bank-cfg-top">
            <div className="field">
              <label>Nome do banco</label>
              <input type="text" placeholder="Ex.: Itaú, Nubank..." value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Moeda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Cor de identificação</label>
            <div className="bank-cfg-swatches">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className={color === c ? 'on' : ''}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="bank-cfg-section">O que este banco tem</div>
          {ACCOUNT_KINDS.map(({ key, title, hint }) => (
            <div key={key} className={`bank-cfg-row${enabled[key] ? ' on' : ''}`}>
              <div className="bank-cfg-head">
                <div className="bank-cfg-title">
                  <b>{title}</b>
                  <small>{hint}</small>
                </div>
                {renderFields(key)}
                <button
                  type="button"
                  className={`bank-cfg-switch${enabled[key] ? ' on' : ''}`}
                  aria-label={title}
                  aria-pressed={enabled[key]}
                  disabled={verifyingKind === key}
                  onClick={() => toggleKind(key)}
                />
              </div>
            </div>
          ))}

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
