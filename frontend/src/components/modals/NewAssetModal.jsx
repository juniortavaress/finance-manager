import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { IconTrash, IconArchive } from '../icons';
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

/**
 * Modal unico para criar OU editar um ativo.
 * Se `asset` for passado, edita (nome/codigo/categoria/corretora), permite
 * arquivar/desarquivar e excluir (excluir so funciona sem compras/vendas,
 * validado pelo backend). Sem `asset`, cria um ativo novo.
 */
export default function NewAssetModal({ open, onClose, onCreated, onSaved, banks, investmentAccounts, asset }) {
  const isEditing = !!asset;
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('acoes');
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setName(asset.name);
      setCode(asset.code || '');
      setType(asset.type);
      setInvestmentAccountId(asset.investment_account_id);
    } else {
      setName('');
      setCode('');
      setType('acoes');
      setInvestmentAccountId(investmentAccounts[0]?.investment_account?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, asset]);

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
      if (isEditing) {
        const { asset: updated } = await investmentsApi.updateAsset(asset.id, {
          investment_account_id: investmentAccountId,
          type,
          code: code.trim() || null,
          name: name.trim(),
        });
        showSuccess('Ativo atualizado com sucesso.');
        onSaved?.(updated);
      } else {
        const { asset: created } = await investmentsApi.createAsset({
          investment_account_id: investmentAccountId,
          type,
          code: code.trim() || undefined,
          name: name.trim(),
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

  async function handleToggleArchive() {
    setArchiving(true);
    try {
      const { asset: updated } = await investmentsApi.updateAsset(asset.id, { archived: !asset.archived });
      showSuccess(asset.archived ? 'Ativo desarquivado com sucesso.' : 'Ativo arquivado com sucesso.');
      onSaved?.(updated);
    } catch (err) {
      showError(err.message || 'Não foi possível arquivar o ativo.');
    } finally {
      setArchiving(false);
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
              <button
                type="button"
                className={`modal-archive-trigger${asset.archived ? ' active' : ''}`}
                title={asset.archived ? 'Desarquivar ativo' : 'Arquivar ativo'}
                disabled={archiving}
                onClick={handleToggleArchive}
              >
                <IconArchive />
              </button>
            )}
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
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar ativo'}
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
