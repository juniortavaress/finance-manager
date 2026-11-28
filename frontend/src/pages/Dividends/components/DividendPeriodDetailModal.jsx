import { useState } from 'react';
import { fmt, fmtDateFull } from '../../../utils/format';
import { localIsoDate } from '../../../utils/date';
import {
  ASSET_TYPE_LABELS,
  KIND_LABELS,
  assetLabel,
  comparePeriod,
  displayValue,
  formatPercent,
  groupByPeriod,
  inCurrency,
  periodKeyOf,
  periodTitle,
  sumValues,
} from '../utils/dividends';
import { CloseButton } from './icons';
import ModalShell from '../../../components/modals/ModalShell';

/**
 * Detalhamento de um periodo (mes 'AAAA-MM' ou ano 'AAAA'): total, comparacao,
 * divisao por banco e por ativo. Clicar num ativo abre a edicao do recebimento
 * (ou lista os recebimentos, quando o ativo tem mais de um no periodo).
 *
 * `pageBankId` e' o filtro de banco ja aplicado na pagina; dentro do modal o
 * usuario ainda pode filtrar por um banco clicando nele.
 */
export default function DividendPeriodDetailModal({
  open,
  onClose,
  periodKey,
  onPeriodChange,
  dividends,
  pageBankId,
  bankOf,
  currencyOfBank,
  onEdit,
}) {
  const [bankId, setBankId] = useState(pageBankId);
  const [order, setOrder] = useState('name');
  const [expandedId, setExpandedId] = useState(null);

  if (!open) return null;

  const yearly = periodKey.length === 4;
  // Com um banco escolhido os valores aparecem na moeda dele; "Por banco"
  // compara todos, entao fica sempre em BRL.
  const currency = bankId ? currencyOfBank(bankId) : 'BRL';
  const filtered = bankId
    ? inCurrency(
        dividends.filter((d) => bankOf(d.asset)?.id === bankId),
        currency
      )
    : dividends;
  const periodAll = dividends.filter((d) => periodKeyOf(d, yearly) === periodKey);
  const items = filtered.filter((d) => periodKeyOf(d, yearly) === periodKey);
  const total = sumValues(items);
  const comparison = comparePeriod(filtered, periodKey, localIsoDate());

  const keys = groupByPeriod(dividends, yearly).map((p) => p.key);
  const previousKey = keys.filter((k) => k < periodKey).pop();
  const nextKey = keys.find((k) => k > periodKey);

  const totalAll = sumValues(periodAll);
  const bankMap = new Map();
  periodAll.forEach((d) => {
    const bank = bankOf(d.asset);
    if (!bank) return;
    const entry = bankMap.get(bank.id) || { bank, value: 0 };
    entry.value += displayValue(d);
    bankMap.set(bank.id, entry);
  });
  const banks = [...bankMap.values()].sort((a, b) => a.bank.name.localeCompare(b.bank.name, 'pt-BR'));
  // "Por banco" so' faz sentido com mais de um banco em jogo.
  const showBanks = !pageBankId && banks.length > 1;

  const assetMap = new Map();
  items.forEach((d) => {
    const entry = assetMap.get(d.asset_id) || { id: d.asset_id, asset: d.asset, value: 0, receipts: [] };
    entry.value += displayValue(d);
    entry.receipts.push(d);
    assetMap.set(d.asset_id, entry);
  });
  const rows = [...assetMap.values()].sort((a, b) =>
    order === 'name' ? assetLabel(a.asset).localeCompare(assetLabel(b.asset), 'pt-BR') : b.value - a.value
  );

  function metaFor(row) {
    const count = row.receipts.length;
    const when =
      !yearly && count === 1
        ? `dia ${Number(row.receipts[0].date.slice(8))}`
        : `${count} ${count > 1 ? 'pagamentos' : 'pagamento'}`;
    return [ASSET_TYPE_LABELS[row.asset?.type], bankOf(row.asset)?.name, when].filter(Boolean).join(' · ');
  }

  function handleRowClick(row) {
    if (row.receipts.length === 1) onEdit(row.receipts[0]);
    else setExpandedId((id) => (id === row.id ? null : row.id));
  }

  const selectedBank = bankId ? bankMap.get(bankId)?.bank : null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal dv-modal dv-detail">
        <div className="dv-detail-head">
          <div className="dv-detail-nav">
            <button
              type="button"
              className="dv-icon-btn"
              aria-label="Período anterior"
              disabled={!previousKey}
              onClick={() => onPeriodChange(previousKey)}
            >
              ‹
            </button>
            <h2>{periodTitle(periodKey)}</h2>
            <button
              type="button"
              className="dv-icon-btn"
              aria-label="Próximo período"
              disabled={!nextKey}
              onClick={() => onPeriodChange(nextKey)}
            >
              ›
            </button>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="dv-detail-body">
          <div className="dv-total">
            <span className="dv-meta">
              {bankId ? `Total recebido em ${selectedBank?.name || 'banco filtrado'}` : 'Total recebido (todos os bancos)'}
            </span>
            <strong className="num">{fmt(total, currency)}</strong>
            <div className="dv-compare">
              {comparison ? (
                <>
                  <span className={`dv-badge${comparison.pct < 0 ? ' down' : ''}`}>
                    {comparison.pct < 0 ? '▼' : '▲'} {formatPercent(Math.abs(comparison.pct))}
                  </span>
                  <span>{comparison.label}</span>
                </>
              ) : (
                <span>sem período anterior para comparar</span>
              )}
            </div>
            <span className="dv-meta">
              {rows.length} {rows.length === 1 ? 'ativo' : 'ativos'} · {items.length}{' '}
              {items.length === 1 ? 'pagamento' : 'pagamentos'}
            </span>
          </div>

          {showBanks && (
            <div className="dv-section banks">
              <div className="dv-section-head">
                <h3>Por banco</h3>
                {bankId && (
                  <button type="button" className="dv-link" onClick={() => setBankId('')}>
                    ver todos
                  </button>
                )}
              </div>
              {banks.map(({ bank, value }) => {
                const share = totalAll ? (value / totalAll) * 100 : 0;
                const active = bankId === bank.id;
                return (
                  <button
                    type="button"
                    key={bank.id}
                    className={`dv-bank${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setBankId(active ? '' : bank.id)}
                  >
                    <span className="dv-bank-line">
                      <span className="dv-swatch" style={{ background: bank.color_hex }} />
                      <span className="dv-bank-name">{bank.name}</span>
                      <span className="dv-meta">{formatPercent(share)}</span>
                      <strong className="num">{fmt(value, 'BRL')}</strong>
                    </span>
                    <span className="dv-track">
                      <div style={{ width: `${share}%`, background: bank.color_hex }} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="dv-section assets">
            <div className="dv-section-head">
              <h3>Por ativo</h3>
              <div className="dv-toggle">
                <button type="button" className={order === 'name' ? 'active' : ''} onClick={() => setOrder('name')}>
                  A–Z
                </button>
                <button type="button" className={order === 'value' ? 'active' : ''} onClick={() => setOrder('value')}>
                  Maior valor
                </button>
              </div>
            </div>
            <div>
              {rows.map((row) => (
                <div key={row.id}>
                  <button
                    type="button"
                    className="dv-asset-row"
                    aria-expanded={row.receipts.length > 1 ? expandedId === row.id : undefined}
                    onClick={() => handleRowClick(row)}
                  >
                    <span className="dv-swatch" style={{ background: bankOf(row.asset)?.color_hex }} />
                    <span className="dv-grow">
                      <span className="dv-name">{assetLabel(row.asset)}</span>
                      <span className="dv-meta">{metaFor(row)}</span>
                    </span>
                    <span className="dv-asset-value">
                      <span className="num">{fmt(row.value, currency)}</span>
                      <small>{formatPercent(total ? (row.value / total) * 100 : 0)}</small>
                    </span>
                  </button>
                  {expandedId === row.id &&
                    row.receipts.length > 1 &&
                    row.receipts.map((d) => (
                      <button type="button" key={d.id} className="dv-asset-row receipt" onClick={() => onEdit(d)}>
                        <span className="dv-grow">
                          <span className="dv-meta">
                            {fmtDateFull(d.date)} · {KIND_LABELS[d.kind]}
                          </span>
                        </span>
                        <span className="num dv-meta">{fmt(displayValue(d), currency)}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
            {rows.length === 0 && <div className="empty-state">Nenhum recebimento neste período.</div>}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
