import { useEffect, useRef, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt, fmtDateFull } from '../../utils/format';
import { maskToNumber, numberToMasked, currencySymbol } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';
import { IconTrash } from '../icons';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Mesmas folgas do backend (fixed_income_service.py): resgate que deixa menos
// que isso na posicao vale como total; e acima da estimativa + 2% e' erro.
const FULL_REDEMPTION_DUST = 1;
const OVERSHOOT_TOLERANCE = 0.02;

/**
 * Aporte/resgate de renda fixa lancado so' por valor (pre-fixado e pos-fixado
 * CDI/Selic): sem quantidade nem preco unitario. No resgate, mostra o saldo
 * estimado da posicao na data e quanto do valor resgatado e' rendimento (o
 * resgate e' proporcional entre os aportes).
 */
export default function FixedIncomeTradeModal({
  open,
  onClose,
  onBack,
  onSaved,
  asset,
  assetDraft,
  kind,
  accountBalance,
  accountCurrency,
  trade,
  onDelete,
}) {
  const { showSuccess, showError } = useToast();
  const isEdit = !!trade;
  const isNewAsset = !asset && !!assetDraft;
  const effectiveAsset = asset || assetDraft;
  const isSell = isEdit ? trade.type === 'sell' : kind === 'sell';

  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [noteId, setNoteId] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [redeemAll, setRedeemAll] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Enquanto o usuario nao mexer no valor, "resgatar tudo" acompanha o saldo
  // estimado (que muda com a data).
  const amountTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (trade) {
      setDate(trade.date);
      setAmount(numberToMasked(trade.gross_amount ?? trade.total_amount));
      setFeeAmount(trade.fee_amount > 0 ? numberToMasked(trade.fee_amount) : '');
      setNoteId(trade.note_id || '');
      setRatePct(trade.fixed_income_rate_pct != null ? String(trade.fixed_income_rate_pct) : '');
      setRedeemAll(!!trade.realized?.full);
      amountTouched.current = true;
    } else {
      setDate(todayIso());
      setAmount('');
      setFeeAmount('');
      setNoteId('');
      const suggestedRate = effectiveAsset?.fixed_income_last_rate_pct ?? effectiveAsset?.fixed_income_rate_pct;
      setRatePct(suggestedRate != null ? String(suggestedRate) : '');
      setRedeemAll(false);
      amountTouched.current = false;
    }
    setPreview(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trade, effectiveAsset]);

  // Saldo estimado da posicao na data do resgate.
  useEffect(() => {
    if (!open || !isSell || !asset?.id || !date) return;
    const controller = new AbortController();
    investmentsApi
      .redemptionPreview(asset.id, { date, exclude: trade?.id }, controller.signal)
      .then((data) => setPreview({ value: data.value, principal: data.principal }))
      .catch((err) => {
        if (err.name !== 'AbortError') setPreview(null);
      });
    return () => controller.abort();
  }, [open, isSell, asset?.id, date, trade?.id]);

  useEffect(() => {
    if (redeemAll && preview && !amountTouched.current) setAmount(numberToMasked(preview.value));
  }, [redeemAll, preview]);

  if (!open || !effectiveAsset) return null;

  const currency = accountCurrency;
  const symbol = currencySymbol(currency);
  const numericAmount = maskToNumber(amount);
  const numericFee = maskToNumber(feeAmount);
  const showFee = isSell || numericFee > 0;
  const rateLabel =
    effectiveAsset.fixed_income_type === 'pos_fixado'
      ? `% do ${effectiveAsset.fixed_income_indexer || 'indexador'} contratado neste aporte`
      : 'Taxa fixa ao ano contratada neste aporte (%)';

  // Quanto do valor resgatado e' principal e quanto e' rendimento (proporcional
  // entre os aportes) - estimativa, o saldo real vem do banco.
  let breakdown = null;
  if (isSell && preview && preview.value > 0 && numericAmount > 0) {
    const isFull = redeemAll || numericAmount >= preview.value - FULL_REDEMPTION_DUST;
    const ratio = isFull ? 1 : numericAmount / preview.value;
    const principalOut = preview.principal * ratio;
    breakdown = {
      principalOut,
      gain: numericAmount - principalOut,
      overshoot: numericAmount > preview.value * (1 + OVERSHOOT_TOLERANCE),
    };
  }

  function handleAmountChange(v) {
    amountTouched.current = true;
    setAmount(v);
  }

  function handleRedeemAllChange(checked) {
    setRedeemAll(checked);
    if (checked && preview) {
      amountTouched.current = false;
      setAmount(numberToMasked(preview.value));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (numericAmount <= 0) return setError('Informe um valor maior que zero.');
    if (isSell && numericFee > numericAmount) return setError('O imposto retido não pode ser maior que o valor resgatado.');
    if (!isSell && !ratePct.trim()) return setError('Informe a taxa contratada neste aporte.');
    if (!isEdit && !isSell && accountBalance != null && numericAmount + numericFee > accountBalance) {
      showError(`Saldo insuficiente. Disponível: ${fmt(accountBalance, currency)}.`);
      return;
    }
    if (breakdown?.overshoot) {
      return setError(`O valor é maior que o saldo estimado da posição (${fmt(preview.value, currency)}).`);
    }

    setSubmitting(true);
    try {
      const payload = {
        date,
        amount: numericAmount,
        fee_amount: numericFee,
        note_id: noteId.trim() || undefined,
        ...(isSell ? { redeem_all: redeemAll } : { fixed_income_rate_pct: Number(ratePct.replace(',', '.')) }),
      };
      if (isEdit) {
        await investmentsApi.updateAssetTransaction(trade.id, payload);
      } else if (isSell) {
        await investmentsApi.sell(asset.id, payload);
      } else {
        const assetId = isNewAsset ? (await investmentsApi.createAsset(assetDraft)).asset.id : asset.id;
        await investmentsApi.buy(assetId, payload);
      }
      showSuccess(isEdit ? 'Operação atualizada com sucesso.' : isSell ? 'Resgate registrado com sucesso.' : 'Aporte registrado com sucesso.');
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível registrar a operação.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const hint = { fontSize: 11.5, marginTop: 4, color: 'var(--ink-faint)' };

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>
            {isEdit ? 'Editar' : isSell ? 'Resgatar' : 'Aportar em'} {effectiveAsset.code || effectiveAsset.name}
          </h2>
          <div className="modal-head-actions">
            {isEdit && onDelete && (
              <button type="button" className="modal-delete-trigger" title="Excluir" onClick={onDelete}>
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
            <label>Data do {isSell ? 'resgate' : 'aporte'}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {isSell && (
            <div className="field">
              <label>Saldo estimado em {date ? fmtDateFull(date) : '—'}</label>
              <div className="a-num" style={{ fontSize: 15 }}>
                {preview ? fmt(preview.value, currency) : '—'}
              </div>
              {preview && (
                <div style={hint}>
                  Investido: {fmt(preview.principal, currency)} · rendimento: {fmt(preview.value - preview.principal, currency)}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>
              {isSell ? 'Valor a resgatar' : 'Valor do aporte'} ({symbol})
            </label>
            <CurrencyInput value={amount} onChange={handleAmountChange} placeholder={`${symbol} 0,00`} />
          </div>

          {isSell && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={redeemAll} onChange={(e) => handleRedeemAllChange(e.target.checked)} />
                Resgatar a posição inteira
              </label>
              <div style={hint}>
                Preenche o saldo estimado; ajuste o valor se o banco pagou outro. Sem marcar, o resgate sai proporcional
                entre os aportes.
              </div>
            </div>
          )}

          {!isSell && (
            <div className="field">
              <label>{rateLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder={effectiveAsset.fixed_income_type === 'pos_fixado' ? 'Ex.: 110' : 'Ex.: 14,5'}
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value.replace(/[^\d,.]/g, ''))}
              />
            </div>
          )}

          {showFee && (
            <div className="field">
              <label>{isSell ? 'Imposto / taxas retidos (opcional)' : 'Taxas'} ({symbol})</label>
              <CurrencyInput value={feeAmount} onChange={setFeeAmount} placeholder={`${symbol} 0,00`} />
              {isSell && <div style={hint}>IR, IOF ou taxa descontados pelo banco no resgate.</div>}
            </div>
          )}

          {isSell && numericAmount > 0 && (
            <div className="field">
              <label>Cai na conta</label>
              <div className="a-num" style={{ fontSize: 15 }}>
                {fmt(numericAmount - numericFee, currency)}
              </div>
              {breakdown && (
                <div
                  style={{
                    ...hint,
                    color: breakdown.overshoot ? 'var(--brick)' : breakdown.gain >= 0 ? 'var(--teal)' : 'var(--brick)',
                  }}
                >
                  {breakdown.overshoot
                    ? 'Maior que o saldo estimado da posição.'
                    : `Rendimento deste resgate: ≈ ${breakdown.gain >= 0 ? '+' : ''}${fmt(breakdown.gain, currency)}` +
                      (numericFee > 0 ? ` (≈ ${fmt(breakdown.gain - numericFee, currency)} após imposto)` : '')}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Nº da nota (opcional)</label>
            <input type="text" placeholder="Ex.: 123456" value={noteId} onChange={(e) => setNoteId(e.target.value)} />
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onBack || onClose}>
              {onBack ? 'Voltar' : 'Cancelar'}
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEdit ? 'Salvar alterações' : isSell ? 'Registrar resgate' : 'Registrar aporte'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
