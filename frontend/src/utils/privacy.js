const PRIVACY_KEY = 'atmos_hide_values';
const listeners = new Set();
let hidden = localStorage.getItem(PRIVACY_KEY) === '1';

export function valuesHidden() {
  return hidden;
}

export function setValuesHidden(next) {
  hidden = !!next;
  localStorage.setItem(PRIVACY_KEY, hidden ? '1' : '0');
  listeners.forEach((fn) => fn());
}

export function subscribePrivacy(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
