import { useEffect, useState } from 'react';
import { investmentsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';
import { maskToNumber } from '../../utils/currency';
import ModalShell from './ModalShell';
import CurrencyInput from '../CurrencyInput';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TradeAssetModal({ open, onClose, onSaved, asset, kind, accountBalance }) {
  const { showSuccess, showError } = useToast();
  const isSell = kind === 'sell';

  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [noteId, setNoteId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(todayIso());
    setQuantity('');
    setUnitPrice('');
    setNoteId('');
    setError('');
  }, [open]);

  if (!open || !asset) return null;

  const numericQuantity = Number(String(quantity).replace(',', '.')) || 0;
  const numericUnitPrice = maskToNumber(unitPrice);
  const totalAmount = numericQuantity * numericUnitPrice;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (numericQuantity <= 0) return setError('Informe uma quantidade maior que zero.');
    if (numericUnitPrice <= 0) return setError('Informe o valor unitário.');
    if (!isSell && accountBalance != null && totalAmount > accountBalance) {
      showError(`Saldo insuficiente. Disponível: ${fmt(accountBalance)}.`);
      return;
    }
    if (isSell && numericQuantity > (asset.position?.quantity || 0)) {
      return setError(`Quantidade insuficiente. Você tem ${asset.position?.quantity || 0}.`);
    }

    setSubmitting(true);
    try {
      const payload = {
        date,
        quantity: numericQuantity,
        unit_price: numericUnitPrice,
        note_id: noteId.trim() || undefined,
      };
      if (isSell) {
        await investmentsApi.sell(asset.id, payload);
      } else {
        await investmentsApi.buy(asset.id, payload);
      }
      showSuccess(isSell ? 'Venda registrada com sucesso.' : 'Compra registrada com sucesso.');
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
            {isSell ? 'Vender' : 'Comprar'} {asset.code || asset.name}
          </h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field-row">
            <div className="field">
              <label>Quantidade</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d,.]/g, ''))}
              />
            </div>
            <div className="field">
              <label>Preço unitário</label>
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} />
            </div>
          </div>

          <div
            className="fatura-note show"
            style={{ background: 'var(--teal-soft)', color: 'var(--teal)', fontWeight: 600 }}
          >
            Total: {fmt(totalAmount)}
            {!isSell && accountBalance != null && ` · Saldo disponível: ${fmt(accountBalance)}`}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Data da {isSell ? 'venda' : 'compra'}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="field">
            <label>Nº da nota (opcional)</label>
            <input type="text" placeholder="Ex.: 123456" value={noteId} onChange={(e) => setNoteId(e.target.value)} />
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isSell ? 'Registrar venda' : 'Registrar compra'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
