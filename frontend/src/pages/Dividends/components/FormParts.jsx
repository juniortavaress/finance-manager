import CurrencyInput from '../../../components/CurrencyInput';
import { CloseButton, DeleteButton } from './icons';

/** Moldura comum dos formularios de provento: cabecalho, campos e acoes. */
export function DividendForm({ title, subtitle, onClose, onDelete, onSubmit, submitting, children }) {
  return (
    <div className="modal dv-modal dv-form">
      <div className="dv-form-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="dv-form-actions-top">
          {onDelete && <DeleteButton onClick={onDelete} />}
          <CloseButton onClick={onClose} />
        </div>
      </div>
      <form className="dv-form-body" onSubmit={onSubmit}>
        {children}
        <div className="dv-form-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Campo de valor, com um seletor opcional alinhado ao rotulo. */
export function ValueField({ label, symbol, value, onChange, toggle, hint }) {
  return (
    <div className={`dv-field dv-value${toggle ? ' with-toggle' : ''}`}>
      <div className="dv-value-label">
        <span>{label}</span>
        {toggle}
      </div>
      <div className="dv-control">
        <span className="num dv-hint">{symbol}</span>
        <CurrencyInput className="num" aria-label={label} placeholder="0,00" value={value} onChange={onChange} />
      </div>
      {hint && <span className="dv-hint">{hint}</span>}
    </div>
  );
}
