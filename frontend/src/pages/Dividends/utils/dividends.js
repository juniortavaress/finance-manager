import { monthLabel, monthLabelFull } from '../../../utils/format';

export const KIND_LABELS = {
  dividendo: 'Dividendo',
  rendimento: 'Rendimento (FII)',
  jcp: 'JCP',
  cupom: 'Cupom',
  bonificacao: 'Bonificação',
  outro: 'Outro',
};

export const FREQUENCY_LABELS = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

export const ASSET_TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acoes: 'Ações',
  fii: 'FII',
  fundos: 'Fundos',
  etf: 'ETF',
  cripto: 'Cripto',
  outro: 'Outro',
};

export const assetLabel = (asset) => asset?.code || asset?.name || '';

// Para botoes que abrem um modal: depois de um clique/toque o foco nao deve
// ficar no botao (ele reaparece marcado ao fechar com ESC). Pelo teclado
// (detail === 0) o foco permanece, para a navegacao continuar de onde estava.
export function blurAfterPointer(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

// Valor do recebimento na moeda da tela: BRL (convertido) por padrao, ou a
// moeda original quando a tela e' so' de um banco estrangeiro (ver inCurrency).
export const displayValue = (dividend) => dividend.display ?? dividend.amount_brl ?? dividend.amount;

export const sumValues = (dividends) => dividends.reduce((total, d) => total + displayValue(d), 0);

/** Prepara os recebimentos de UM banco para exibicao na moeda dele. */
export function inCurrency(dividends, currency) {
  if (currency === 'BRL') return dividends;
  return dividends.map((d) => ({ ...d, display: d.amount }));
}

/**
 * Moeda em que a tela de um banco e' exibida: a das contas de investimento
 * dele. Com contas em moedas diferentes, e' BRL.
 */
export function bankCurrency(investmentAccounts, bankId) {
  const currencies = new Set(investmentAccounts.filter((a) => a.bank_id === bankId).map((a) => a.currency));
  return currencies.size === 1 ? [...currencies][0] : 'BRL';
}

// Chave do periodo de um recebimento: 'AAAA-MM' (mensal) ou 'AAAA' (anual).
// O mes mantem o zero a esquerda para a ordenacao por texto ser cronologica.
export const periodKeyOf = (dividend, yearly) => dividend.date.slice(0, yearly ? 4 : 7);

export function periodTitle(key) {
  if (key.length === 4) return key;
  return `${monthLabelFull(Number(key.slice(5)))} ${key.slice(0, 4)}`;
}

export function periodShortLabel(key) {
  if (key.length === 4) return key;
  return `${monthLabel(Number(key.slice(5))).toLowerCase()}/${key.slice(2, 4)}`;
}

export function groupByPeriod(dividends, yearly) {
  const map = new Map();
  dividends.forEach((d) => {
    const key = periodKeyOf(d, yearly);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  });
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, items]) => ({ key, items }));
}

export function previousMonthKey(monthKey) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Primeiro dia da janela de 12 meses que termina no mes de `todayIso`. */
export function lastTwelveMonthsStart(todayIso) {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  return month === 12 ? `${year}-01-01` : `${year - 1}-${String(month + 1).padStart(2, '0')}-01`;
}

export function variation(total, base) {
  return base > 0 ? ((total - base) / base) * 100 : null;
}

/**
 * Compara um periodo com o anterior que tenha recebimentos. O ano em andamento
 * e' comparado com o mesmo intervalo de meses do ano anterior.
 */
export function comparePeriod(dividends, key, todayIso) {
  const yearly = key.length === 4;
  const periods = groupByPeriod(dividends, yearly);
  const previous = periods.filter((p) => p.key < key).pop();
  if (!previous) return null;

  const partial = yearly && key === todayIso.slice(0, 4);
  const month = todayIso.slice(5, 7);
  const base = partial ? previous.items.filter((d) => d.date.slice(5, 7) <= month) : previous.items;
  const current = periods.find((p) => p.key === key)?.items || [];
  const pct = variation(sumValues(current), sumValues(base));
  if (pct === null) return null;

  const interval = partial && month !== '01' ? `jan–${monthLabel(Number(month)).toLowerCase()} ` : '';
  return { pct, label: `vs ${interval}${periodTitle(previous.key).toLowerCase()}` };
}

export function formatPercent(value) {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

const PAYMENTS_PER_YEAR = { monthly: 12, quarterly: 4, semiannual: 2, yearly: 1 };

// Quantas vezes por ano o ativo paga: pelo recorrente ativo (o mais frequente,
// se houver mais de um); sem recorrente, so' FII e' presumido mensal.
function paymentsPerYear(asset, assetId, schedules) {
  const counts = schedules
    .filter((s) => s.active && s.asset_id === assetId)
    .map((s) => PAYMENTS_PER_YEAR[s.frequency] || 0);
  if (counts.length) return Math.max(...counts);
  return asset?.type === 'fii' ? 12 : null;
}

/**
 * Soma por ativo dos recebimentos informados (a janela de 12 meses que comeca
 * em `windowStart`), com o yield sobre custo: o que cada cota pagou no ano
 * dividido pelo preco medio pago. Calcular por cota evita distorcao quando
 * houve compras no meio do periodo.
 *
 * Quem ainda nao tem um ano de pagamentos (primeiro recebimento depois do
 * inicio da janela) tem o ano projetado: media por mes pago x pagamentos por
 * ano. O valor recebido (`value`) e' sempre o real.
 */
export function payersByAsset(dividends, positionByAssetId, { history, schedules, windowStart }) {
  const map = new Map();
  dividends.forEach((d) => {
    let entry = map.get(d.asset_id);
    if (!entry) {
      entry = { assetId: d.asset_id, asset: d.asset, value: 0, perShare: 0, paidMonths: new Set() };
      map.set(d.asset_id, entry);
    }
    entry.value += displayValue(d);
    if (d.quantity_snapshot > 0) {
      entry.perShare += d.amount / d.quantity_snapshot;
      entry.paidMonths.add(d.date.slice(0, 7));
    }
  });

  const startMonth = windowStart.slice(0, 7);
  const withFullYear = new Set(history.filter((d) => d.date.slice(0, 7) <= startMonth).map((d) => d.asset_id));

  return [...map.values()].map(({ paidMonths, perShare, ...entry }) => {
    const position = positionByAssetId.get(entry.assetId);
    const hasYield = position?.quantity > 0 && position.avg_unit_price > 0 && perShare > 0;
    const frequency = withFullYear.has(entry.assetId)
      ? null
      : paymentsPerYear(entry.asset, entry.assetId, schedules);
    const annualPerShare = frequency ? (perShare / paidMonths.size) * frequency : perShare;
    return { ...entry, yieldOnCost: hasYield ? (annualPerShare / position.avg_unit_price) * 100 : null };
  });
}
