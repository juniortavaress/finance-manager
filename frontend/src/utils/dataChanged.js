const listeners = new Set();

export function notifyDataChanged() {
  listeners.forEach((listener) => listener());
}

export function onDataChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
