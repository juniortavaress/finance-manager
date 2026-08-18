export function fmt(value) {
  const v = Number(value) || 0;
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '− R$ ' : 'R$ ') + s;
}

export function fmtCompact(value) {
  const v = Number(value) || 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function monthLabel(month) {
  return MONTH_LABELS[month - 1];
}

const MONTH_LABELS_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function monthLabelFull(month) {
  return MONTH_LABELS_FULL[month - 1];
}

export function fmtDateShort(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${monthLabel(d.getMonth() + 1).toLowerCase()}`;
}

export function fmtDateFull(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}
