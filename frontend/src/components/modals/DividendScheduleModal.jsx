import { useEffect, useState } from 'react';
import { dividendsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { currencySymbol, maskToNumber, numberToMasked } from '../../utils/currency';
import { getDefaultCurrency } from '../../state/currentUserCurrency';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { AssetSearch, Select } from '../dividends/Dropdowns';
import { DividendForm, ValueField } from '../dividends/FormParts';
import { useFormError } from '../../hooks/useFormError';
import { FREQUENCY_LABELS, KIND_LABELS, assetLabel } from '../../utils/dividends';

const KINDS = ['dividendo', 'rendimento', 'jcp', 'cupom', 'outro'];
const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Provento recorrente: cadastra a regra (ativo + valor por cota ou fixo +
 * periodicidade). O backend materializa os recebimentos automaticamente na
 * data prevista, usando a posição do ativo naquele momento.
 */
export default function DividendScheduleModal({ open, onClose, onSaved, schedule, assets = [], bankOf }) {
  const isEditing = !!schedule;
  const { showSuccess, showError } = useToast();

  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState('dividendo');
  const [calcMode, setCalcMode] = useState('per_share');
  const [amountPerShare, setAmountPerShare] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('15');
  const [, setError] = useFormError();
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      const perShare = schedule.calc_mode === 'per_share';
      setAssetId(schedule.asset_id);
      setKind(schedule.kind);
      setCalcMode(schedule.calc_mode);
      setAmountPerShare(perShare && schedule.amount_per_share != null ? numberToMasked(schedule.amount_per_share) : '');
      setFixedAmount(!perShare && schedule.fixed_amount != null ? numberToMasked(schedule.fixed_amount) : '');
      setFrequency(schedule.frequency);
      setDayOfMonth(String(schedule.day_of_month));
    } else {
      setAssetId('');
      setKind('dividendo');
      setCalcMode('per_share');
      setAmountPerShare('');
      setFixedAmount('');
      setFrequency('monthly');
      setDayOfMonth('15');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, schedule]);

  if (!open) return null;

  const asset = assets.find((a) => a.id === assetId) || schedule?.asset;
  const quantity = asset?.position?.quantity || 0;
  const currency = asset?.currency || getDefaultCurrency();
  const isPerShare = calcMode === 'per_share';
  const numericPerShare = maskToNumber(amountPerShare);
  const numericFixed = maskToNumber(fixedAmount);
  const value = isPerShare ? numericPerShare : numericFixed;
  const kinds = KINDS.includes(kind) ? KINDS : [...KINDS, kind];

  let estimate = null;
  if (quantity > 0 && value > 0) {
    estimate = isPerShare
      ? `${fmt(value * quantity, currency)} por pagamento, com ${quantity} cotas`
      : `${fmt(value / quantity, currency)} por cota, com ${quantity} cotas`;
  }

  // Ao alternar, o valor do outro modo e' derivado do digitado. O original fica
  // guardado, para ir e voltar sem perder centavos no arredondamento.
  function changeMode(next) {
    if (next === calcMode) return;
    if (next === 'fixed' && !fixedAmount && numericPerShare && quantity) {
      setFixedAmount(numberToMasked(numericPerShare * quantity));
    }
    if (next === 'per_share' && !amountPerShare && numericFixed && quantity) {
      setAmountPerShare(numberToMasked(numericFixed / quantity));
    }
    setCalcMode(next);
  }

  function changeValue(masked) {
    setAmountPerShare(isPerShare ? masked : '');
    setFixedAmount(isPerShare ? '' : masked);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!assetId) return setError('Selecione um ativo.');
    if (isPerShare && numericPerShare <= 0) return setError('Informe o valor por cota.');
    if (!isPerShare && numericFixed <= 0) return setError('Informe o valor total.');
    const day = Number(dayOfMonth);
    if (!day || day < 1 || day > 31) return setError('Informe um dia válido (1 a 31).');

    setSubmitting(true);
    try {
      const payload = {
        asset_id: assetId,
        kind,
        calc_mode: calcMode,
        amount_per_share: isPerShare ? numericPerShare : undefined,
        fixed_amount: isPerShare ? undefined : numericFixed,
        frequency,
        day_of_month: day,
      };
      if (isEditing) {
        await dividendsApi.updateSchedule(schedule.id, payload);
        showSuccess('Provento atualizado com sucesso.');
      } else {
        await dividendsApi.createSchedule(payload);
        showSuccess('Provento recorrente criado com sucesso.');
      }
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar o provento.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    await dividendsApi.removeSchedule(schedule.id);
    showSuccess('Provento recorrente excluído com sucesso.');
    setDeleteModalOpen(false);
    onSaved?.();
  }

  const subtitle = isEditing
    ? [assetLabel(asset), asset ? bankOf(asset)?.name : null].filter(Boolean).join(' · ')
    : 'Se repete automaticamente';

  return (
    <ModalShell open={open} onClose={onClose}>
      <DividendForm
        title={isEditing ? 'Editar recorrente' : 'Novo recorrente'}
        subtitle={subtitle}
        onClose={onClose}
        onDelete={isEditing ? () => setDeleteModalOpen(true) : undefined}
        onSubmit={handleSubmit}
        submitting={submitting}
      >
        {/* O ativo de um recorrente existente nao pode ser trocado. */}
        {!isEditing && <AssetSearch assets={assets} value={assetId} onChange={setAssetId} bankOf={bankOf} />}

        <div className="dv-grid">
          <Select
            className="full"
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={kinds.map((k) => ({ value: k, label: KIND_LABELS[k] || k }))}
          />
          <Select label="Repete" value={frequency} onChange={setFrequency} options={FREQUENCY_OPTIONS} />
          <label className="dv-field">
            <span>Dia do pagamento</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="dv-control num"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </label>
        </div>

        <ValueField
          label="Valor do provento"
          symbol={currencySymbol(currency)}
          value={isPerShare ? amountPerShare : fixedAmount}
          onChange={changeValue}
          hint={estimate}
          toggle={
            <div className="dv-toggle pill" role="group" aria-label="Forma de cálculo">
              <button type="button" className={isPerShare ? 'active' : ''} aria-pressed={isPerShare} onClick={() => changeMode('per_share')}>
                Por cota
              </button>
              <button type="button" className={isPerShare ? '' : 'active'} aria-pressed={!isPerShare} onClick={() => changeMode('fixed')}>
                Total
              </button>
            </div>
          }
        />
      </DividendForm>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir provento recorrente"
          message="Tem certeza? Os recebimentos já registrados no histórico não serão apagados, mas nenhum novo será gerado. Esta ação não pode ser desfeita."
        />
      )}
    </ModalShell>
  );
}
