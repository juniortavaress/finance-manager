// Mascara valores como um caixa eletronico: cada digito digitado entra pela
// direita, empurrando os centavos. Elimina qualquer ambiguidade entre "." e ","
// (formato BR de milhar vs. decimal) porque o usuario nunca digita o separador.
export function maskCurrencyDigits(rawDigits) {
  const digits = rawDigits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const cents = padded.slice(-2);
  const intPart = padded.slice(0, -2);
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFormatted},${cents}`;
}

export function maskToNumber(masked) {
  if (!masked) return 0;
  const digits = masked.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export function numberToMasked(value) {
  const cents = Math.round((Number(value) || 0) * 100);
  return maskCurrencyDigits(String(cents));
}

export const CURRENCY_OPTIONS = [
  { code: 'BRL', label: 'Real (R$)', symbol: 'R$' },
  { code: 'USD', label: 'Dólar (US$)', symbol: 'US$' },
  { code: 'EUR', label: 'Euro (€)', symbol: '€' },
  { code: 'GBP', label: 'Libra (£)', symbol: '£' },
];

const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCY_OPTIONS.map((c) => [c.code, c.symbol]));

export function currencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code || 'R$';
}
