import { maskCurrencyDigits } from '../utils/currency';

export default function CurrencyInput({ value, onChange, placeholder = 'R$ 0,00', ...props }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(maskCurrencyDigits(e.target.value))}
      {...props}
    />
  );
}
