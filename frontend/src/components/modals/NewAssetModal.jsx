import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const TYPE_OPTIONS = [
  { value: 'renda_fixa', label: 'Renda fixa' },
  { value: 'acoes', label: 'Ações' },
  { value: 'fii', label: 'FII' },
  { value: 'fundos', label: 'Fundos' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'outro', label: 'Outro' },
];

const FIXED_INCOME_TYPE_OPTIONS = [
  { value: 'pos_fixado', label: 'Pós-fixado' },
  { value: 'pre_fixado', label: 'Pré-fixado' },
  { value: 'ipca', label: 'IPCA+' },
];

const INDEXER_OPTIONS = ['CDI', 'Selic'];

/**
 * Modal unico para criar OU editar um ativo.
 * Se `asset` for passado, edita (nome/codigo/categoria/corretora) e permite
 * excluir (so funciona sem compras/vendas, validado pelo backend). Sem
 * `asset`, cria um ativo novo. Arquivamento e automatico: um ativo some da
 * carteira ativa e cai em "arquivados" quando sua quantidade zera.
 */
export default function NewAssetModal({
  open,
  onClose,
  onCreated,
  onSaved,
  onDraftReady,
  deferCreate = false,
  banks,
  investmentAccounts,
  asset,
  presetInvestmentAccountId,
  presetName = '',
}) {
  const isEditing = !!asset;
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('acoes');
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [fixedIncomeType, setFixedIncomeType] = useState('');
  const [fixedIncomeIndexer, setFixedIncomeIndexer] = useState(INDEXER_OPTIONS[0]);
  const [fixedIncomeRatePct, setFixedIncomeRatePct] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isRendaFixa = type === 'renda_fixa';
  const isCripto = type === 'cripto';

  const { data: cryptoSymbolsData } = useFetch(
    (signal) => investmentsApi.listCryptoSymbols(signal),
    []
  );
  const cryptoSymbols = cryptoSymbolsData?.symbols || [];

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setName(asset.name);
      setCode(asset.code || '');
      setType(asset.type);
      setInvestmentAccountId(asset.investment_account_id);
      setFixedIncomeType(asset.fixed_income_type || '');
      setFixedIncomeIndexer(asset.fixed_income_indexer || INDEXER_OPTIONS[0]);
      setFixedIncomeRatePct(asset.fixed_income_rate_pct != null ? String(asset.fixed_income_rate_pct) : '');
      setMaturityDate(asset.maturity_date || '');
    } else {
      setName(presetName || '');
      setCode('');
      setType('acoes');
      setInvestmentAccountId(presetInvestmentAccountId || investmentAccounts[0]?.investment_account?.id || '');
      setFixedIncomeType('');
      setFixedIncomeIndexer(INDEXER_OPTIONS[0]);
      setFixedIncomeRatePct('');
      setMaturityDate('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, asset, presetInvestmentAccountId, presetName]);

  if (!open) return null;

  function bankNameFor(account) {
    const bank = banks.find((b) => b.id === account.bank_id);
    return bank?.name || account.name;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (isCripto && !isEditing) {
      if (!code) return setError('Selecione a criptomoeda.');
    } else if (!name.trim()) {
      return setError('Informe o nome do ativo.');
    }
    if (!investmentAccountId) return setError('Selecione um banco/corretora.');

    // renda fixa exige os campos completos apenas ao CRIAR um ativo novo —
    // ativos antigos sem esses dados podem ser editados livremente para corrigi-los
    if (isRendaFixa && !isEditing) {
      if (!fixedIncomeType) return setError('Selecione o tipo de renda fixa.');
      if (fixedIncomeType === 'pos_fixado' && !fixedIncomeIndexer.trim()) {
        return setError('Informe o indexador (ex.: CDI, Selic).');
      }
      if (!fixedIncomeRatePct.trim()) return setError('Informe a taxa.');
      if (!maturityDate) return setError('Informe a data de vencimento.');
    }

    const fixedIncomePayload = isRendaFixa
      ? {
          fixed_income_type: fixedIncomeType || null,
          fixed_income_indexer: fixedIncomeType === 'pos_fixado' ? fixedIncomeIndexer.trim() || null : null,
          fixed_income_rate_pct: fixedIncomeRatePct.trim() ? Number(fixedIncomeRatePct.replace(',', '.')) : null,
          maturity_date: maturityDate || null,
        }
      : {};

    const codeValue = isRendaFixa ? null : code.trim() || null;

    if (!isEditing && deferCreate) {
      onDraftReady?.({
        investment_account_id: investmentAccountId,
        type,
        code: codeValue || undefined,
        name: name.trim(),
        ...fixedIncomePayload,
      });
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const { asset: updated } = await investmentsApi.updateAsset(asset.id, {
          investment_account_id: investmentAccountId,
          type,
          code: codeValue,
          name: name.trim(),
          ...fixedIncomePayload,
        });
        showSuccess('Ativo atualizado com sucesso.');
        onSaved?.(updated);
      } else {
        const { asset: created } = await investmentsApi.createAsset({
          investment_account_id: investmentAccountId,
          type,
          code: codeValue || undefined,
          name: name.trim(),
          ...fixedIncomePayload,
        });
        showSuccess('Ativo criado com sucesso.');
        onCreated?.(created);
      }
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o ativo.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    await investmentsApi.removeAsset(asset.id);
    showSuccess('Ativo excluído com sucesso.');
    setDeleteModalOpen(false);
    onSaved?.();
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar ativo' : 'Novo ativo'}</h2>
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
            <label>Banco / corretora</label>
            <select value={investmentAccountId} onChange={(e) => setInvestmentAccountId(e.target.value)}>
              {investmentAccounts.map((a) => (
                <option key={a.investment_account?.id} value={a.investment_account?.id}>
                  {bankNameFor(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Categoria</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (!isEditing) {
                  setName('');
                  setCode('');
                }
              }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isCripto && !isEditing ? (
            <div className="field">
              <label>Criptomoeda</label>
              <select
                value={code}
                onChange={(e) => {
                  const selected = cryptoSymbols.find((s) => s.code === e.target.value);
                  setCode(selected?.code || '');
                  setName(selected?.name || '');
                }}
              >
                <option value="">Selecione...</option>
                {cryptoSymbols.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Nome</label>
                <input
                  type="text"
                  placeholder={isRendaFixa ? 'Ex.: CDB Banco XP 2029, Tesouro Selic 2029...' : 'Ex.: Petrobras, Tesouro Selic 2029...'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {!isRendaFixa && (
                <div className="field">
                  <label>Código (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex.: PETR4, BTC..."
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
              )}
            </>
          )}

          {isRendaFixa && (
            <>
              <div className="field">
                <label>Tipo de renda fixa</label>
                <select value={fixedIncomeType} onChange={(e) => setFixedIncomeType(e.target.value)}>
                  <option value="">Selecione...</option>
                  {FIXED_INCOME_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {fixedIncomeType === 'pos_fixado' && (
                <div className="field">
                  <label>Indexador</label>
                  <select value={fixedIncomeIndexer} onChange={(e) => setFixedIncomeIndexer(e.target.value)}>
                    {INDEXER_OPTIONS.map((idx) => (
                      <option key={idx} value={idx}>
                        {idx}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {fixedIncomeType && (
                <div className="field">
                  <label>
                    {fixedIncomeType === 'pos_fixado'
                      ? `% do ${fixedIncomeIndexer.trim() || 'indexador'}`
                      : fixedIncomeType === 'pre_fixado'
                      ? 'Taxa fixa ao ano (%)'
                      : 'Taxa adicional ao IPCA (%)'}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={fixedIncomeType === 'pos_fixado' ? 'Ex.: 110' : 'Ex.: 14,5'}
                    value={fixedIncomeRatePct}
                    onChange={(e) => setFixedIncomeRatePct(e.target.value.replace(/[^\d,.]/g, ''))}
                  />
                  {isEditing && asset?.fixed_income_avg_rate_pct != null && (
                    <div className="field-hint">
                      Média ponderada das compras: {asset.fixed_income_avg_rate_pct.toFixed(2).replace('.', ',')}%
                      {fixedIncomeType === 'pos_fixado' ? ` do ${fixedIncomeIndexer.trim() || 'indexador'}` : ''}
                      {' '}(cada lote usa sua própria taxa no cálculo — este campo não é editável aqui)
                    </div>
                  )}
                </div>
              )}

              <div className="field">
                <label>Data de vencimento</label>
                <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting
                ? 'Salvando...'
                : isEditing
                ? 'Salvar alterações'
                : deferCreate
                ? 'Próximo'
                : 'Salvar ativo'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir ativo"
          message="Tem certeza que deseja excluir este ativo? Só é possível excluir ativos sem compras ou vendas registradas. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
