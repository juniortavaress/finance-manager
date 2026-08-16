import { useEffect, useState } from 'react';
import { dividendsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';

const KIND_OPTIONS = [
  { value: 'dividendo', label: 'Dividendo' },
  { value: 'jcp', label: 'JCP' },
  { value: 'bonificacao', label: 'Bonificação' },
  { value: 'outro', label: 'Outro' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dividendo avulso: um único recebimento, sem gerar uma recorrência
 * cadastrada. Também serve para editar/corrigir um recebimento já existente
 * (avulso ou já materializado de um provento recorrente).
 */
export default function DividendModal({ open, onClose, onSaved, onDeleted, dividend, assets = [], bankNameFor }) {
  const isEditing = !!dividend;
  const { showSuccess, showError } = useToast();

  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState('dividendo');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setAssetId(dividend.asset_id);
      setKind(dividend.kind);
      setAmount(numberToMasked(dividend.amount));
      setDate(dividend.date);
    } else {
      setAssetId(assets[0]?.id || '');
      setKind('dividendo');
      setAmount('');
      setDate(todayIso());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, dividend]);

  if (!open) return null;

  const numericAmount = maskToNumber(amount);
  const isFromSchedule = isEditing && !!dividend.schedule_id;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!isEditing && !assetId) return setError('Selecione um ativo.');
    if (numericAmount <= 0) return setError('Informe o valor recebido.');
    if (!date) return setError('Informe a data do recebimento.');

    setSubmitting(true);
    try {
      if (isEditing) {
        await dividendsApi.update(dividend.id, { amount: numericAmount, date, kind });
        showSuccess('Recebimento atualizado com sucesso.');
      } else {
        await dividendsApi.create({ asset_id: assetId, kind, amount: numericAmount, date });
        showSuccess('Recebimento registrado com sucesso.');
      }
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o recebimento.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    await dividendsApi.remove(dividend.id);
    showSuccess('Recebimento excluído com sucesso.');
    setDeleteModalOpen(false);
    onDeleted?.();
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar recebimento' : 'Dividendo avulso'}</h2>
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
            <label>Ativo</label>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={isEditing}>
              {(isEditing ? assets.filter((a) => a.id === assetId) : assets).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code || a.name} — {bankNameFor?.(a) || ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Tipo de provento</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Valor recebido</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div className="field">
              <label>Data do recebimento</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {isFromSchedule && (
            <div className="fatura-note show" style={{ background: 'var(--bg)', color: 'var(--ink-soft)' }}>
              Este recebimento veio de um provento recorrente. Editar aqui corrige só esta ocorrência.
            </div>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar recebimento'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir recebimento"
          message="Tem certeza que deseja excluir este recebimento? A receita correspondente também será removida da conta de investimento. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
