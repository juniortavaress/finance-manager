import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';

const TYPE_OPTIONS = [
  { value: 'renda_fixa', label: 'Renda fixa' },
  { value: 'acoes', label: 'Ações' },
  { value: 'fii', label: 'FII' },
  { value: 'fundos', label: 'Fundos' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'outro', label: 'Outro' },
];

export default function NewAssetModal({ open, onClose, onCreated, banks, investmentAccounts }) {
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('acoes');
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setCode('');
    setType('acoes');
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

    if (!name.trim()) return setError('Informe o nome do ativo.');
    if (!investmentAccountId) return setError('Selecione um banco/corretora.');

    setSubmitting(true);
    try {
      const { asset } = await investmentsApi.createAsset({
        investment_account_id: investmentAccountId,
        type,
        code: code.trim() || undefined,
        name: name.trim(),
      });
      showSuccess('Ativo criado com sucesso.');
      onCreated?.(asset);
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o ativo.';
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
          <h2>Novo ativo</h2>
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
              placeholder="Ex.: Petrobras, Tesouro Selic 2029..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Código (opcional)</label>
            <input
              type="text"
              placeholder="Ex.: PETR4, BTC..."
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className="field">
            <label>Categoria</label>
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

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar ativo'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
