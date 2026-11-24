import { useEffect, useMemo, useRef, useState } from 'react';
import { transactionsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDateShort } from '../utils/format';
import { maskToNumber } from '../utils/currency';
import { localIsoDate } from '../utils/date';
import { IconClose } from './icons';
import CurrencyInput from './CurrencyInput';
import LoadMoreButton from './LoadMoreButton';
import Skeleton from './Skeleton';

const PAGE_SIZE = 30;
const DELTA_VISIBLE_MS = 2500;
const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function signedAmount(tx) {
  return tx.type === 'income' ? tx.amount : -tx.amount;
}

export default function AccountLedgerDrawer({
  open,
  bank,
  checking,
  creditCard,
  expenseCategories,
  incomeCategories,
  onClose,
  refreshKey,
  onChanged,
  onEdit,
}) {
  const { showSuccess, showError } = useToast();
  const descriptionRef = useRef(null);
  const previousBalance = useRef(null);

  const [tipo, setTipo] = useState('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localIsoDate());
  const [categoryId, setCategoryId] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [installments, setInstallments] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState([]);
  const [delta, setDelta] = useState(null);

  const categories = tipo === 'expense' ? expenseCategories : incomeCategories;
  const isCredit = accountRef.startsWith('credit:');
  const currency = checking?.currency;

  useEffect(() => {
    if (!open) return;
    setTipo('expense');
    setDescription('');
    setAmount('');
    setDate(localIsoDate());
    setInstallments(1);
    setError('');
    setPage(1);
    setAccumulated([]);
    setAccountRef(checking ? `checking:${checking.id}` : creditCard ? `credit:${creditCard.id}` : '');
    previousBalance.current = null;
    setDelta(null);
    descriptionRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, checking?.id, creditCard?.id]);

  useEffect(() => {
    setCategoryId((current) => (categories.some((c) => c.id === current) ? current : categories[0]?.id || ''));
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const { data, loading, reload } = useFetch(
    (signal) =>
      open && checking
        ? transactionsApi.list({ account_id: checking.id, status: 'confirmed', page, page_size: PAGE_SIZE }, signal)
        : Promise.resolve({ transactions: [], total: 0 }),
    [open, checking?.id, page, refreshKey]
  );

  useEffect(() => {
    setPage(1);
  }, [refreshKey]);

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (page === 1 ? data.transactions : [...prev, ...data.transactions]));
  }, [data, page]);

  const balance = checking?.balance ?? 0;

  useEffect(() => {
    if (!open || !checking) return;
    const previous = previousBalance.current;
    previousBalance.current = balance;
    if (previous === null || previous === balance) return;
    setDelta({ value: balance - previous, key: Date.now() });
    const timer = setTimeout(() => setDelta(null), DELTA_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [balance, open, checking]);

  const rows = useMemo(() => {
    let running = balance;
    return accumulated.map((tx) => {
      const row = { tx, balanceAfter: running };
      running -= signedAmount(tx);
      return row;
    });
  }, [accumulated, balance]);

  const groups = useMemo(() => {
    const result = [];
    rows.forEach((row) => {
      const last = result[result.length - 1];
      if (last && last.date === row.tx.date) last.rows.push(row);
      else result.push({ date: row.tx.date, rows: [row] });
    });
    return result;
  }, [rows]);

  function reloadFromStart() {
    if (page === 1) reload();
    else setPage(1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const numericAmount = maskToNumber(amount);
    if (!description.trim()) return setError('Informe uma descrição.');
    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (!categoryId) return setError('Selecione uma categoria.');
    if (!accountRef) return setError('Selecione uma conta ou cartão.');

    setError('');
    setSubmitting(true);
    try {
      const [, accountId] = accountRef.split(':');
      await transactionsApi.create({
        description: description.trim(),
        amount: numericAmount,
        type: tipo,
        account_id: accountId,
        category_id: categoryId,
        date,
        payment_method: isCredit ? 'credit' : 'debit',
        installments_count: isCredit && tipo === 'expense' ? installments : 1,
      });
      showSuccess(isCredit ? 'Lançado na fatura do cartão.' : 'Transação lançada.');
      setDescription('');
      setAmount('');
      setInstallments(1);
      reloadFromStart();
      onChanged?.();
      descriptionRef.current?.focus();
    } catch (err) {
      const message = err.message || 'Não foi possível lançar a transação.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function selectTipo(next) {
    setTipo(next);
    if (next === 'income' && isCredit && checking) setAccountRef(`checking:${checking.id}`);
  }

  if (!bank) return null;

  return (
    <>
      <div className={`ledger-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`ledger-drawer${open ? ' open' : ''}`} aria-hidden={!open} aria-label={`Extrato ${bank.name}`}>
        <header className="ledger-head">
          <div className="ledger-title">
            <span className="chip" style={{ background: bank.color_hex }} />
            <h2>{bank.name}</h2>
            <button type="button" className="ledger-close" onClick={onClose} aria-label="Fechar">
              <IconClose />
            </button>
          </div>
          {checking && (
            <div className="ledger-balance">
              <span className="ledger-balance-label">Saldo em conta</span>
              <span className="ledger-balance-row">
                <strong
                  key={delta?.key ?? 'static'}
                  className={`num${delta ? (delta.value > 0 ? ' flash-up' : ' flash-down') : ''}`}
                >
                  {fmt(balance, currency)}
                </strong>
                {delta && (
                  <span className={`ledger-delta num ${delta.value > 0 ? 'up' : 'down'}`}>
                    {delta.value > 0 ? '+' : '−'} {fmt(Math.abs(delta.value), currency)}
                  </span>
                )}
              </span>
            </div>
          )}
        </header>

        <form className="ledger-form" onSubmit={handleSubmit}>
          <div className="seg">
            <div className={`seg-opt despesa${tipo === 'expense' ? ' active' : ''}`} onClick={() => selectTipo('expense')}>
              ↓ Despesa
            </div>
            <div className={`seg-opt receita${tipo === 'income' ? ' active' : ''}`} onClick={() => selectTipo('income')}>
              ↑ Receita
            </div>
          </div>

          <div className="field">
            <label>Descrição</label>
            <input
              ref={descriptionRef}
              type="text"
              placeholder="Ex.: Supermercado, Salário, Uber..."
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
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field-row">
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
            <div className="field">
              <label>Conta / Cartão</label>
              <select value={accountRef} onChange={(e) => setAccountRef(e.target.value)}>
                {checking && <option value={`checking:${checking.id}`}>{checking.name}</option>}
                {creditCard && tipo === 'expense' && <option value={`credit:${creditCard.id}`}>{creditCard.name}</option>}
              </select>
            </div>
          </div>

          {isCredit && tipo === 'expense' && (
            <div className="field">
              <label>Parcelar em</label>
              <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                {INSTALLMENT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1x (à vista)' : `${n}x`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="form-error-banner">{error}</div>}

          <button className="btn btn-primary ledger-submit" type="submit" disabled={submitting}>
            {submitting ? 'Lançando...' : 'Lançar'}
          </button>
        </form>

        <section className="ledger-list">
          <h3>Extrato da conta</h3>
          {loading && accumulated.length === 0 ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={46} radius={8} style={{ marginBottom: 6 }} />)
          ) : groups.length === 0 ? (
            <div className="empty-state">Nenhuma movimentação nesta conta.</div>
          ) : (
            groups.map((group) => (
              <div key={group.date}>
                <div className="ledger-day">{fmtDateShort(group.date)}</div>
                {group.rows.map(({ tx, balanceAfter }) => (
                  <button type="button" className="ledger-row" key={tx.id} onClick={() => onEdit?.(tx)}>
                    <span className="ledger-ico">{tx.category?.icon}</span>
                    <span className="ledger-desc">
                      <span className="ledger-name">{tx.description}</span>
                      <span className="ledger-cat">{tx.category?.name}</span>
                    </span>
                    <span className={`ledger-amount num ${tx.type === 'income' ? 'in' : 'out'}`}>
                      {tx.type === 'income' ? '+ ' : '− '}
                      {fmt(tx.amount, currency)}
                    </span>
                    <span className="ledger-run num" title="Saldo após este lançamento">
                      {fmt(balanceAfter, currency)}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
          <LoadMoreButton
            shown={accumulated.length}
            total={data?.total || 0}
            loading={loading}
            onClick={() => setPage((p) => p + 1)}
          />
        </section>
      </aside>
    </>
  );
}
