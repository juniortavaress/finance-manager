import { useEffect, useState } from 'react';
import { dividendsApi } from '../../../api/resources';
import { useToast } from '../../../context/ToastContext';
import { currencySymbol, maskToNumber, numberToMasked } from '../../../utils/currency';
import { getDefaultCurrency } from '../../../state/currentUserCurrency';
import ModalShell from '../../../components/modals/ModalShell';
import ConfirmDeleteModal from '../../../components/modals/ConfirmDeleteModal';
import { AssetSearch, Select } from './Dropdowns';
import { DividendForm, ValueField } from './FormParts';
import { localIsoDate } from '../../../utils/date';
import { useFormError } from '../../../hooks/useFormError';
import { KIND_LABELS, assetLabel } from '../utils/dividends';

const KINDS = ['dividendo', 'rendimento', 'jcp', 'bonificacao', 'outro'];

/**
 * Dividendo avulso: um único recebimento, sem gerar uma recorrência
 * cadastrada. Também serve para editar/corrigir um recebimento já existente
 * (avulso ou já materializado de um provento recorrente).
 */
export default function DividendModal({ open, onClose, onSaved, onDeleted, dividend, assets = [], bankOf }) {
  const isEditing = !!dividend;
  const { showSuccess, showError } = useToast();

  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState('dividendo');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localIsoDate());
  const [, setError] = useFormError();
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
      setAssetId('');
      setKind('dividendo');
      setAmount('');
      setDate(localIsoDate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, dividend]);

  if (!open) return null;

  const numericAmount = maskToNumber(amount);
  const isFromSchedule = isEditing && !!dividend.schedule_id;
  const asset = assets.find((a) => a.id === assetId) || dividend?.asset;
  const currency = asset?.currency || dividend?.currency || getDefaultCurrency();
  // Um tipo antigo fora da lista continua selecionavel, para editar sem troca-lo.
  const kinds = KINDS.includes(kind) ? KINDS : [...KINDS, kind];

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

  const subtitle = isEditing
    ? [assetLabel(asset), asset ? bankOf(asset)?.name : null].filter(Boolean).join(' · ')
    : 'Um recebimento único';

  return (
    <ModalShell open={open} onClose={onClose}>
      <DividendForm
        title={isEditing ? 'Editar recebimento' : 'Dividendo avulso'}
        subtitle={subtitle}
        onClose={onClose}
        onDelete={isEditing ? () => setDeleteModalOpen(true) : undefined}
        onSubmit={handleSubmit}
        submitting={submitting}
      >
        {!isEditing && <AssetSearch assets={assets} value={assetId} onChange={setAssetId} bankOf={bankOf} />}

        <div className="dv-grid">
          <Select
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={kinds.map((value) => ({ value, label: KIND_LABELS[value] || value }))}
          />
          <label className="dv-field">
            <span>Recebido em</span>
            <input type="date" className="dv-control" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <ValueField label="Valor recebido" symbol={currencySymbol(currency)} value={amount} onChange={setAmount} />

        {isFromSchedule && (
          <p className="dv-hint">
            Este recebimento veio de um provento recorrente. Editar aqui corrige só esta ocorrência.
          </p>
        )}
      </DividendForm>

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
