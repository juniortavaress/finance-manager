import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { investmentsApi, dividendsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt } from '../utils/format';
import InvestmentEvolutionChart from '../components/charts/InvestmentEvolutionChart';
import UpcomingDividendsChart from '../components/charts/UpcomingDividendsChart';
import InvestmentRentabilityDrilldownModal from '../components/modals/InvestmentRentabilityDrilldownModal';
import InvestmentBreakdownDrilldownModal from '../components/modals/InvestmentBreakdownDrilldownModal';
import { IconChevronDown } from '../components/icons';

const FREQUENCY_MONTHS = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const PROJECTION_MONTHS = 6;
const PROJECTION_OCCURRENCES_CAP = 24;

const TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acoes: 'Ações',
  fii: 'FII',
  fundos: 'Fundos',
  cripto: 'Cripto',
  outro: 'Outro',
};
const TYPE_COLORS = {
  renda_fixa: '#0F5C5C',
  acoes: '#C0912F',
  fii: '#3D7A8C',
  fundos: '#7A4FE0',
  cripto: '#A6432C',
  outro: '#8B9A97',
};

export default function Investments() {
  const navigate = useNavigate();
  const { bankById, reloadAll } = useData();
  const [bankFilter, setBankFilter] = useState('');
  const { data: summaryData, reload: reloadSummary } = useFetch(
    () => investmentsApi.summary(bankFilter || undefined),
    [bankFilter]
  );
  const { data: dividendsData, reload: reloadDividends } = useFetch(() => dividendsApi.list(), []);
  const { data: schedulesData, reload: reloadSchedules } = useFetch(() => dividendsApi.listSchedules(), []);
  const [drilldown, setDrilldown] = useState(null);

  const assets = summaryData?.assets || [];
  const unallocatedByBank = summaryData?.unallocated_by_bank || [];
  const evolution = summaryData?.evolution || [];
  const totalUnallocated = summaryData?.total_unallocated || 0;
  const dividends = dividendsData?.dividends || [];
  const schedules = schedulesData?.dividend_schedules || [];
  const totalInvested = summaryData?.total_invested || 0;

  function reload() {
    reloadSummary();
    reloadDividends();
    reloadSchedules();
    reloadAll();
  }

  const activeAssets = useMemo(() => assets.filter((a) => a.position.quantity > 0), [assets]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const dividendsThisMonth = useMemo(
    () => dividends.filter((d) => d.date.slice(0, 7) === currentMonth).reduce((s, d) => s + d.amount, 0),
    [dividends, currentMonth]
  );

  const upcomingDividends = useMemo(() => {
    const today = new Date();
    const monthBuckets = [];
    for (let i = 0; i < PROJECTION_MONTHS; i += 1) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      monthBuckets.push({ year: d.getFullYear(), month: d.getMonth() + 1, total: 0 });
    }
    const bucketIndex = new Map(monthBuckets.map((b, i) => [`${b.year}-${b.month}`, i]));
    const horizonEnd = new Date(today.getFullYear(), today.getMonth() + PROJECTION_MONTHS, 1);

    schedules
      .filter((s) => s.active)
      .forEach((s) => {
        const asset = assets.find((a) => a.id === s.asset_id);
        const quantity = asset?.position?.quantity || 0;
        const value = s.calc_mode === 'fixed' ? s.fixed_amount || 0 : (s.amount_per_share || 0) * quantity;
        if (value <= 0) return;

        const step = FREQUENCY_MONTHS[s.frequency] || 1;
        let cursor = new Date(`${s.next_due_date}T00:00:00`);
        let guard = 0;
        while (cursor < horizonEnd && guard < PROJECTION_OCCURRENCES_CAP) {
          const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
          if (bucketIndex.has(key)) monthBuckets[bucketIndex.get(key)].total += value;
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, cursor.getDate());
          guard += 1;
        }
      });

    return monthBuckets;
  }, [schedules, assets]);

  const totalCurrent = activeAssets.reduce(
    (s, a) => s + (a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount),
    0
  );
  const totalDividends = activeAssets.reduce((s, a) => s + (a.position.dividends_total || 0), 0);
  const allocatedCostBasis = activeAssets.reduce((s, a) => s + a.position.invested_amount, 0);
  const rentabilidade =
    summaryData?.rentability_total != null
      ? summaryData.rentability_total
      : allocatedCostBasis > 0
      ? ((totalCurrent + totalDividends - allocatedCostBasis) / allocatedCostBasis) * 100
      : 0;

  const byType = useMemo(() => {
    const map = {};
    activeAssets.forEach((a) => {
      const value = a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount;
      map[a.type] = (map[a.type] || 0) + value;
    });
    return Object.entries(map)
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total);
  }, [activeAssets]);
  const typeMax = Math.max(1, ...byType.map((t) => t.total));
  const typeSum = byType.reduce((s, t) => s + t.total, 0) || 1;

  const byBank = useMemo(() => {
    const map = {};
    activeAssets.forEach((a) => {
      const value = a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount;
      map[a.bank_id] = map[a.bank_id] || { bank_id: a.bank_id, name: a.bank_name, color: a.bank_color, total: 0 };
      map[a.bank_id].total += value;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [activeAssets]);
  const bankMax = Math.max(1, ...byBank.map((b) => b.total));
  const bankSum = byBank.reduce((s, b) => s + b.total, 0) || 1;

  const bankOptions = useMemo(() => {
    const seen = new Map();
    assets.forEach((a) => {
      if (!seen.has(a.bank_id)) seen.set(a.bank_id, a.bank_name);
    });
    return [...seen.entries()];
  }, [assets]);

  const topPositions = useMemo(
    () =>
      [...activeAssets]
        .sort((a, b) => {
          const va = a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount;
          const vb = b.position.current_amount != null ? b.position.current_amount : b.position.invested_amount;
          return vb - va;
        })
        .slice(0, 5),
    [activeAssets]
  );

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>
          Investimentos{' '}
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontWeight: 400 }}>
            — visão geral
          </span>
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="filter-select">
            <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
              <option value="">Todas as corretoras</option>
              {bankOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Total investido</div>
          <div className="value num">{fmt(totalInvested)}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#8B9A97' }}>
          <div className="label">Caixa disponível</div>
          <div className="value num">{fmt(totalUnallocated)}</div>
          {unallocatedByBank.length > 0 && (
            <button
              type="button"
              className="stat-card-expand"
              title="Ver por corretora"
              onClick={() => setDrilldown({ kind: 'unallocated' })}
            >
              <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
            </button>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Valor atual</div>
          <div className="value num">{fmt(totalCurrent)}</div>
          {byBank.length > 0 && (
            <button
              type="button"
              className="stat-card-expand"
              title="Ver por corretora"
              onClick={() => setDrilldown({ kind: 'current' })}
            >
              <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
            </button>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Rentabilidade</div>
          <div className="value num">
            {activeAssets.length ? `${rentabilidade >= 0 ? '+' : ''}${rentabilidade.toFixed(1)}%` : '—'}
          </div>
          {activeAssets.length > 0 && (
            <button
              type="button"
              className="stat-card-expand"
              title="Ver detalhes"
              onClick={() => setDrilldown({ kind: 'rentability' })}
            >
              <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
            </button>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Dividendos este mês</div>
          <div className="value num">{fmt(dividendsThisMonth)}</div>
        </div>
      </div>


      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3>Distribuição por tipo</h3>
          {byType.length === 0 && <div className="empty-state">Nenhum ativo com posição.</div>}
          {byType.map(({ type, total }) => (
            <div className="hbar-row" key={type}>
              <div className="hbar-top">
                <span className="cat">
                  <span className="catdot" style={{ background: TYPE_COLORS[type] }} />
                  {TYPE_LABELS[type]}
                </span>
                <span className="val num">
                  {fmt(total)} · {((total / typeSum) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{ width: `${(total / typeMax) * 100}%`, background: TYPE_COLORS[type] }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Distribuição por corretora/banco</h3>
          {byBank.length === 0 && <div className="empty-state">Nenhum ativo com posição.</div>}
          {byBank.map((b) => (
            <div className="hbar-row" key={b.bank_id}>
              <div className="hbar-top">
                <span className="cat">
                  <span className="catdot" style={{ background: b.color }} />
                  {b.name}
                </span>
                <span className="val num">
                  {fmt(b.total)} · {((b.total / bankSum) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="hbar-track">
                <div className="hbar-fill" style={{ width: `${(b.total / bankMax) * 100}%`, background: b.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Evolução do patrimônio investido</span>
            {evolution.length > 0 && (
              <span style={{ display: 'flex', gap: 12, textTransform: 'none', letterSpacing: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-soft)' }}>
                  <span style={{ width: 14, height: 2, background: 'var(--teal)', display: 'inline-block' }} />
                  Valor atual
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-soft)' }}>
                  <span
                    style={{
                      width: 14,
                      height: 0,
                      borderTop: '2px dashed var(--ink-faint)',
                      display: 'inline-block',
                    }}
                  />
                  Aportado
                </span>
              </span>
            )}
          </h3>
          {evolution.length > 0 ? (
            <InvestmentEvolutionChart periods={evolution} />
          ) : (
            <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Nenhuma compra registrada ainda.
            </div>
          )}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3>
            Próximos dividendos{' '}
            <span className="action" onClick={() => navigate('/investimentos/dividendos')}>
              ver todos →
            </span>
          </h3>
          {upcomingDividends.every((p) => p.total === 0) ? (
            <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Nenhum provento recorrente ativo.
            </div>
          ) : (
            <UpcomingDividendsChart periods={upcomingDividends} />
          )}
        </div>
      </div>

      <div className="card">
        <h3>{bankFilter ? `Posições em ${bankOptions.find(([id]) => id === bankFilter)?.[1] || ''}` : 'Maiores posições'}</h3>
        {topPositions.length === 0 && <div className="empty-state">Nenhum ativo com posição.</div>}
        {topPositions.map((asset) => {
          const pos = asset.position;
          return (
            <div className="tx-row" key={asset.id}>
              <div className="tx-left">
                <div className="tx-icon" style={{ background: `${TYPE_COLORS[asset.type]}22`, color: TYPE_COLORS[asset.type] }}>
                  {(asset.code || asset.name).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="tx-desc">{asset.code || asset.name}</div>
                    {asset.code && <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{asset.name}</span>}
                  </div>
                  <div className="tx-meta">
                    {asset.bank_name} · {pos.quantity} un. · preço médio {fmt(pos.avg_unit_price)}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tx-val num">{fmt(pos.current_amount != null ? pos.current_amount : pos.invested_amount)}</div>
                <div className="tx-meta">investido {fmt(pos.invested_amount)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <InvestmentRentabilityDrilldownModal
        open={drilldown?.kind === 'rentability'}
        onClose={() => setDrilldown(null)}
        rentabilityTotal={summaryData?.rentability_total}
        rentabilityLastMonth={summaryData?.rentability_last_month}
        rentabilityLastYear={summaryData?.rentability_last_year}
      />

      <InvestmentBreakdownDrilldownModal
        open={drilldown?.kind === 'unallocated'}
        onClose={() => setDrilldown(null)}
        title="Caixa disponível por corretora"
        rows={unallocatedByBank.map((b) => ({ label: b.bank_name, value: b.balance, color: b.bank_color }))}
      />

      <InvestmentBreakdownDrilldownModal
        open={drilldown?.kind === 'current'}
        onClose={() => setDrilldown(null)}
        title="Valor atual por corretora"
        rows={byBank.map((b) => ({ label: b.name, value: b.total, color: b.color }))}
      />
    </div>
  );
}
