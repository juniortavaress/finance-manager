let _defaultCurrency = 'BRL';

export function setDefaultCurrency(code) {
  _defaultCurrency = code || 'BRL';
}

export function getDefaultCurrency() {
  return _defaultCurrency;
}
