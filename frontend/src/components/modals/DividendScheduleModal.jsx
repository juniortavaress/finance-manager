import { useEffect, useMemo, useState } from 'react';
import { dividendsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { IconTrash } from '../icons';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CurrencyInput from '../CurrencyInput';

const KIND_OPTIONS = [
  { value: 'dividendo', label: 'Dividendo' },
  { value: 'jcp', label: 'JCP' },
  { value: 'cupom', label: 'Cupom' },
  { value: 'outro', label: 'Outro' },
];

const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Provento recorrente: cadastra a regra (ativo + valor por cota ou fixo +
 * periodicidade). O backend materializa os recebimentos automaticamente na
 * data prevista, usando a posição do ativo naquele momento.
 */
export default function DividendScheduleModal({ open, onClose, onSaved, schedule, assets = [], bankNameFor }) {
  const isEditing = !!schedule;
  const { showSuccess, showError } = useToast();

  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState('dividendo');
  const [calcMode, setCalcMode] = useState('per_share');
  const [amountPerShare, setAmountPerShare] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('15');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEditing) {
      setAssetId(schedule.asset_id);
      setKind(schedule.kind);
      setCalcMode(schedule.calc_mode);
      setAmountPerShare(schedule.amount_per_share != null ? numberToMasked(schedule.amount_per_share) : '');
      setFixedAmount(schedule.fixed_amount != null ? numberToMasked(schedule.fixed_amount) : '');
      setFrequency(schedule.frequency);
      setDayOfMonth(String(schedule.day_of_month));
    } else {
      setAssetId(assets[0]?.id || '');
      setKind('dividendo');
      setCalcMode('per_share');
      setAmountPerShare('');
      setFixedAmount('');
      setFrequency('monthly');
      setDayOfMonth('15');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, schedule]);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === assetId), [assets, assetId]);
  const quantity = selectedAsset?.position?.quantity || 0;

  if (!open) return null;

  const numericPerShare = maskToNumber(amountPerShare);
  const numericFixed = maskToNumber(fixedAmount);
  const estimatedValue = calcMode === 'per_share' ? numericPerShare * quantity : numericFixed;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!assetId) return setError('Selecione um ativo.');
    if (calcMode === 'per_share' && numericPerShare <= 0) return setError('Informe o valor por cota.');
    if (calcMode === 'fixed' && numericFixed <= 0) return setError('Informe o valor fixo.');
    const day = Number(dayOfMonth);
    if (!day || day < 1 || day > 31) return setError('Informe um dia válido (1 a 31).');

    setSubmitting(true);
    try {
      const payload = {
        asset_id: assetId,
        kind,
        calc_mode: calcMode,
        amount_per_share: calcMode === 'per_share' ? numericPerShare : undefined,
        fixed_amount: calcMode === 'fixed' ? numericFixed : undefined,
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

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar provento recorrente' : 'Novo provento recorrente'}</h2>
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
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              {assets.map((a) => (
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

          <div className="field">
            <div className="seg">
              <div
                className={`seg-opt${calcMode === 'per_share' ? ' active' : ''}`}
                onClick={() => setCalcMode('per_share')}
              >
                Valor por cota
              </div>
              <div className={`seg-opt${calcMode === 'fixed' ? ' active' : ''}`} onClick={() => setCalcMode('fixed')}>
                Valor fixo
              </div>
            </div>
          </div>

          {calcMode === 'per_share' ? (
            <div className="field-row">
              <div className="field">
                <label>Valor por cota</label>
                <CurrencyInput value={amountPerShare} onChange={setAmountPerShare} />
              </div>
              <div className="field">
                <label>Quantidade de cotas</label>
                <input type="text" value={quantity} disabled />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>Valor fixo</label>
              <CurrencyInput value={fixedAmount} onChange={setFixedAmount} />
            </div>
          )}

          {estimatedValue > 0 && (
            <div
              className="fatura-note show"
              style={{ background: 'var(--teal-soft)', color: 'var(--teal)', marginBottom: 14 }}
            >
              Valor estimado: {fmt(estimatedValue)}
            </div>
          )}

          <div className="field">
            <label>Periodicidade</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Dia previsto do pagamento</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar provento'}
            </button>
          </div>
        </form>
      </div>

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
