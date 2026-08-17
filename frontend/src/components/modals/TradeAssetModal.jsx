import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TradeAssetModal({ open, onClose, onSaved, asset, kind, accountBalance, trade }) {
  const { showSuccess, showError } = useToast();
  const isEdit = !!trade;
  const isSell = isEdit ? trade.type === 'sell' : kind === 'sell';

  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [noteId, setNoteId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (trade) {
      setDate(trade.date);
      setQuantity(String(trade.quantity));
      setUnitPrice(numberToMasked(trade.unit_price));
      setFeeAmount(numberToMasked(trade.fee_amount));
      setTotalAmount(numberToMasked(trade.total_amount));
      setNoteId(trade.note_id || '');
    } else {
      setDate(todayIso());
      setQuantity('');
      setUnitPrice('');
      setFeeAmount('');
      setTotalAmount('');
      setNoteId('');
    }
    setError('');
  }, [open, trade]);

  if (!open || !asset) return null;

  const numericQuantity = Number(String(quantity).replace(',', '.')) || 0;
  const numericUnitPrice = maskToNumber(unitPrice);
  const numericFee = maskToNumber(feeAmount);
  const baseAmount = numericQuantity * numericUnitPrice;
  const numericTotal = maskToNumber(totalAmount);
  const feeSign = isSell ? -1 : 1;

  function handleQuantityChange(v) {
    const clean = v.replace(/[^\d,.]/g, '');
    setQuantity(clean);
    const qty = Number(clean.replace(',', '.')) || 0;
    setTotalAmount(numberToMasked(qty * numericUnitPrice + feeSign * numericFee));
  }

  function handleUnitPriceChange(v) {
    setUnitPrice(v);
    const price = maskToNumber(v);
    setTotalAmount(numberToMasked(numericQuantity * price + feeSign * numericFee));
  }

  function handleFeeChange(v) {
    setFeeAmount(v);
    const fee = maskToNumber(v);
    setTotalAmount(numberToMasked(baseAmount + feeSign * fee));
  }

  function handleTotalChange(v) {
    setTotalAmount(v);
    const total = maskToNumber(v);
    setFeeAmount(numberToMasked(Math.max(0, feeSign * (total - baseAmount))));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (numericQuantity <= 0) return setError('Informe uma quantidade maior que zero.');
    if (numericUnitPrice <= 0) return setError('Informe o valor unitário.');
    if (!isEdit && !isSell && accountBalance != null && numericTotal > accountBalance) {
      showError(`Saldo insuficiente. Disponível: ${fmt(accountBalance)}.`);
      return;
    }
    if (!isEdit && isSell && numericQuantity > (asset.position?.quantity || 0)) {
      return setError(`Quantidade insuficiente. Você tem ${asset.position?.quantity || 0}.`);
    }

    setSubmitting(true);
    try {
      const payload = {
        date,
        quantity: numericQuantity,
        unit_price: numericUnitPrice,
        fee_amount: numericFee,
        note_id: noteId.trim() || undefined,
      };
      if (isEdit) {
        await investmentsApi.updateAssetTransaction(trade.id, payload);
      } else if (isSell) {
        await investmentsApi.sell(asset.id, payload);
      } else {
        await investmentsApi.buy(asset.id, payload);
      }
      showSuccess(isEdit ? 'Operação atualizada com sucesso.' : isSell ? 'Venda registrada com sucesso.' : 'Compra registrada com sucesso.');
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível registrar a operação.';
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
          <h2>
            {isEdit ? 'Editar' : isSell ? 'Vender' : 'Comprar'} {asset.code || asset.name}
          </h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Nº da nota (opcional)</label>
            <input type="text" placeholder="Ex.: 123456" value={noteId} onChange={(e) => setNoteId(e.target.value)} />
          </div>

          <div className="field">
            <label>Data da {isSell ? 'venda' : 'compra'}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Quantidade</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Preço unitário</label>
              <CurrencyInput value={unitPrice} onChange={handleUnitPriceChange} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Taxa</label>
              <CurrencyInput value={feeAmount} onChange={handleFeeChange} />
            </div>
            <div className="field">
              <label>Valor final</label>
              <CurrencyInput value={totalAmount} onChange={handleTotalChange} />
            </div>
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEdit ? 'Salvar alterações' : isSell ? 'Registrar venda' : 'Registrar compra'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
