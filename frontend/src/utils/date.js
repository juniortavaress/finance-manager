// Datas no fuso LOCAL do usuario. `new Date().toISOString()` devolve a data em
// UTC - depois das 21h em Brasilia ja e "amanha", o que gravava lancamentos
// com a data errada e marcava faturas como atrasadas antes da hora.

const pad = (n) => String(n).padStart(2, '0');

export function toLocalIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localIsoDate() {
  return toLocalIso(new Date());
}
