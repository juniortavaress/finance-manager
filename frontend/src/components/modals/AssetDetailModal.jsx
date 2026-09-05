import { investmentsApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { fmt, fmtDateFull } from '../../utils/format';
import InvestmentEvolutionChart from '../charts/InvestmentEvolutionChart';
import ModalShell from './ModalShell';
import Skeleton from '../Skeleton';

const TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acoes: 'Ações',
  fii: 'FII',
  fundos: 'Fundos',
  cripto: 'Cripto',
  outro: 'Outro',
};

/**
 * Detalhe de um ativo individual: evolucao mensal (investido vs. atual) e
 * historico de compras/vendas. Aberto a partir de um botao na linha/card do
 * ativo, tanto no desktop quanto no mobile.
 */
export default function AssetDetailModal({ open, onClose, asset }) {
  const assetId = asset?.id || null;
  const currency = asset?.currency;

  const { data: evoData, initialLoading: evoLoading } = useFetch(
    (signal) => (assetId ? investmentsApi.assetEvolution(assetId, signal) : Promise.resolve({ evolution: [] })),
    [assetId, open]
  );
  const { data: txData, initialLoading: txLoading } = useFetch(
    (signal) =>
      assetId
        ? investmentsApi.listAssetTransactions({ asset_id: assetId, page_size: 50 }, signal)
        : Promise.resolve({ asset_transactions: [] }),
    [assetId, open]
  );

  if (!open) return null;

  const evolution = evoData?.evolution || [];
  const transactions = txData?.asset_transactions || [];

  const isFixedIncome = asset?.type === 'renda_fixa';
  const position = asset?.position;
  const currentAmount = position ? (position.current_amount != null ? position.current_amount : position.invested_amount) : null;
  const profit = position != null ? currentAmount + (position.dividends_total || 0) - position.invested_amount : null;
  const rent = position?.total_return_pct;

  const metrics = [
    !isFixedIncome && { label: 'Qtd.', value: position?.quantity },
    !isFixedIncome && { label: 'Preço médio', value: position ? fmt(position.avg_unit_price, currency) : null },
    !isFixedIncome && {
      label: 'Preço atual',
      value: asset?.current_unit_price != null ? fmt(asset.current_unit_price, currency) : '—',
    },
    isFixedIncome && { label: 'Qtd.', value: position?.quantity },
    { label: 'Investido', value: position ? fmt(position.invested_amount, currency) : null },
    { label: 'Atual', value: currentAmount != null ? fmt(currentAmount, currency) : '—' },
    { label: 'Dividendos', value: position ? fmt(position.dividends_total, currency) : null },
    {
      label: 'Lucro',
      value: profit != null ? `${profit >= 0 ? '+' : ''}${fmt(profit, currency)}` : null,
      color: profit != null ? (profit >= 0 ? 'var(--teal)' : 'var(--brick)') : undefined,
    },
    {
      label: 'Rentabilidade',
      value: rent != null ? `${rent >= 0 ? '+' : ''}${rent.toFixed(1)}%` : '—',
      color: rent != null ? (rent >= 0 ? 'var(--teal)' : 'var(--brick)') : undefined,
    },
  ].filter(Boolean);

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <div>
            <h2>{asset?.code || asset?.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
              {TYPE_LABELS[asset?.type] || asset?.type}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body modal-body-scroll">
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Evolução</h3>
          {evoLoading && <Skeleton width="100%" height={180} radius={8} />}
          {!evoLoading && evolution.length < 2 && (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Histórico insuficiente para exibir o gráfico.</p>
          )}
          {!evoLoading && evolution.length >= 2 && <InvestmentEvolutionChart periods={evolution} />}

          <h3 style={{ fontSize: 13, marginTop: 36, marginBottom: 10 }}>Dados</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: 12,
              marginBottom: 20,
              padding: '12px 14px',
              background: 'var(--bg-soft, rgba(0,0,0,0.02))',
              borderRadius: 8,
            }}
          >
            {metrics.map((m) => (
              <div key={m.label}>
                <div className="asset-card-label">{m.label}</div>
                <div className="a-num" style={{ color: m.color }}>
                  {m.value != null ? m.value : '—'}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, marginTop: 36, marginBottom: 10 }}>Histórico de transações</h3>
          {txLoading &&
            [0, 1, 2].map((i) => (
              <div className="tx-row" key={i}>
                <div className="tx-left">
                  <div>
                    <Skeleton width={140} height={13} style={{ marginBottom: 6 }} />
                    <Skeleton width={90} height={11} />
                  </div>
                </div>
                <Skeleton width={70} height={14} />
              </div>
            ))}
          {!txLoading && transactions.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Nenhuma transação registrada.</p>
          )}
          {!txLoading &&
            transactions.map((tx) => (
              <div className="tx-row" key={tx.id}>
                <div className="tx-left">
                  <div>
                    <div className="tx-desc">
                      {tx.type === 'buy' ? 'Compra' : 'Venda'} · {tx.quantity} un.
                    </div>
                    <div className="tx-meta">
                      {fmtDateFull(tx.date)} · preço unit. {fmt(tx.unit_price, currency)}
                      {tx.fixed_income_rate_pct != null ? ` · ${tx.fixed_income_rate_pct}%` : ''}
                    </div>
                  </div>
                </div>
                <div className={`tx-val num ${tx.type === 'buy' ? 'neg' : 'pos'}`}>
                  {fmt(tx.total_amount, currency)}
                </div>
              </div>
            ))}
        </div>
      </div>
    </ModalShell>
  );
}
