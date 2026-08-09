import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { maskToNumber } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';

const TYPE_OPTIONS = [
  { value: 'renda_fixa', label: 'Renda fixa' },
  { value: 'acoes', label: 'Ações' },
  { value: 'fundos', label: 'Fundos' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'outro', label: 'Outro' },
];

export default function NewInvestmentModal({ open, onClose, onCreated, banks, investmentAccounts }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('renda_fixa');
  const [investedAmount, setInvestedAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setType('renda_fixa');
    setInvestedAmount('');
    setCurrentAmount('');
    setError('');
    setInvestmentAccountId(investmentAccounts[0]?.investment_account?.id || '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function bankNameFor(account) {
    const bank = banks.find((b) => b.id === account.bank_id);
    return bank?.name || account.name;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const invested = maskToNumber(investedAmount);
    const current = currentAmount ? maskToNumber(currentAmount) : invested;

    if (!name.trim()) return setError('Informe o nome do investimento.');
    if (!investmentAccountId) return setError('Selecione um banco/corretora.');
    if (invested <= 0) return setError('Informe o valor investido.');

    setSubmitting(true);
    try {
      await investmentsApi.create({
        investment_account_id: investmentAccountId,
        type,
        name: name.trim(),
        invested_amount: invested,
        current_amount: current,
      });
      onCreated?.();
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o investimento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Novo investimento</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Nome</label>
            <input
              type="text"
              placeholder="Ex.: Tesouro Selic 2029, PETR4..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Banco / corretora</label>
            <select value={investmentAccountId} onChange={(e) => setInvestmentAccountId(e.target.value)}>
              {investmentAccounts.map((a) => (
                <option key={a.investment_account?.id} value={a.investment_account?.id}>
                  {bankNameFor(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Valor investido</label>
              <CurrencyInput value={investedAmount} onChange={setInvestedAmount} />
            </div>
            <div className="field">
              <label>Valor atual</label>
              <CurrencyInput
                value={currentAmount}
                onChange={setCurrentAmount}
                placeholder="igual ao investido"
              />
            </div>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar investimento'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
