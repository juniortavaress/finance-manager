import { useCallback, useMemo, useState } from 'react';
import { dividendsApi, investmentsApi, quotesApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useBanks } from '../hooks/resources/useBanks';
import { useAccounts } from '../hooks/resources/useAccounts';
import { investmentAccounts as filterInvestment } from '../utils/accounts';
import { fmt, monthLabelFull } from '../utils/format';
import { localIsoDate } from '../utils/date';
import {
  amountBrl,
  blurAfterPointer,
  comparePeriod,
  formatPercent,
  groupByPeriod,
  lastTwelveMonthsStart,
  payersByAsset,
  periodShortLabel,
  periodTitle,
  previousMonthKey,
  sumBrl,
  variation,
} from '../utils/dividends';
import DividendScheduleModal from '../components/modals/DividendScheduleModal';
import DividendModal from '../components/modals/DividendModal';
import DividendPeriodDetailModal from '../components/modals/DividendPeriodDetailModal';
import DividendsHistoryChart from '../components/charts/DividendsHistoryChart';
import RecurringCard from '../components/dividends/RecurringCard';
import TopPayersCard from '../components/dividends/TopPayersCard';
import { ExpandIcon } from '../components/dividends/icons';
import Skeleton from '../components/Skeleton';

const EMPTY_LIST = [];

function NewDividendMenu({ onSingle, onRecurring }) {
  const [open, setOpen] = useState(false);

  function pick(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="dv-new" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      {open && <button type="button" className="dv-backdrop" tabIndex={-1} aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <button type="button" className="period" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + novo provento
      </button>
      {open && (
        <div className="dv-menu">
          <button type="button" onClick={() => pick(onSingle)}>
            Dividendo avulso
            <span>Um recebimento único</span>
          </button>
          <button type="button" onClick={() => pick(onRecurring)}>
            Provento recorrente
            <span>Se repete automaticamente</span>
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, detail, detailClass = '', stripe, loading, onExpand }) {
  return (
    <div className="card stat-card" style={{ '--stripe': stripe }}>
      <div className="label">{label}</div>
      {loading ? <Skeleton width={110} height={24} /> : <div className="value num">{value}</div>}
      {!loading && detail && <div className={`delta ${detailClass}`}>{detail}</div>}
      {onExpand && (
        <button
          type="button"
          className="dv-expand"
          onClick={(e) => {
            blurAfterPointer(e);
            onExpand();
          }}
          aria-label="Ver o ano por banco"
          title="Ver o ano por banco"
        >
          <ExpandIcon />
        </button>
      )}
    </div>
  );
}

// Linha de variacao dos cards de total (▲ 12,3% vs ...).
function deltaProps(pct, label) {
  if (pct === null) return { detail: 'sem base de comparação' };
  return {
    detail: `${pct < 0 ? '▼' : '▲'} ${formatPercent(Math.abs(pct))} ${label}`,
    detailClass: pct < 0 ? 'down' : 'up',
  };
}

export default function Dividends() {
  const { data: assetsData, reload: reloadAssets } = useFetch((signal) => investmentsApi.listAssetsLight(signal), []);
  const { data: schedulesData, loading: schedulesLoading, reload: reloadSchedules } = useFetch(
    () => dividendsApi.listSchedules(),
    []
  );
  // Preco medio de cada ativo, usado no yield sobre custo (mesmo cache da Visao geral).
  const { data: summaryData, initialLoading: summaryLoading, reload: reloadSummary } = useFetch(
    (signal) => investmentsApi.summary(undefined, signal),
    [],
    { cacheKey: 'investments.summary' }
  );
  const { data: quotesData } = useFetch(() => quotesApi.list(), []);
  const { banks, reload: reloadBanks } = useBanks();
  const { accounts, reload: reloadAccounts } = useAccounts();

  // Uma UNICA chamada busca todo o historico (sem paginacao no backend):
  // alimenta o grafico, os totais, o ranking e o detalhamento.
  const { data: dividendsData, reload: reloadDividends, loading: dividendsLoading } = useFetch(
    () => dividendsApi.list({ limit: 100000 }),
    []
  );

  const allDividends = dividendsData?.dividends || EMPTY_LIST;
  const assets = assetsData?.assets || EMPTY_LIST;
  const schedules = schedulesData?.dividend_schedules || EMPTY_LIST;
  const loadingDividends = dividendsLoading && !dividendsData;

  const banksById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks]);
  const bankByAccountId = useMemo(() => {
    const map = new Map();
    filterInvestment(accounts).forEach((a) => map.set(a.investment_account?.id, banksById.get(a.bank_id)));
    return map;
  }, [accounts, banksById]);
  const bankOf = useCallback((asset) => bankByAccountId.get(asset?.investment_account_id), [bankByAccountId]);

  // So' aparecem nos filtros os bancos que ja pagaram algum provento.
  const payingBanks = useMemo(() => {
    const map = new Map();
    allDividends.forEach((d) => {
      const bank = bankOf(d.asset);
      if (bank) map.set(bank.id, bank);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allDividends, bankOf]);

  const [selectedBankId, setSelectedBankId] = useState('');
  // Um banco que deixou de ter recebimentos (exclusao) volta para "todos".
  const bankFilter = payingBanks.some((b) => b.id === selectedBankId) ? selectedBankId : '';
  const dividends = useMemo(
    () => (bankFilter ? allDividends.filter((d) => bankOf(d.asset)?.id === bankFilter) : allDividends),
    [allDividends, bankFilter, bankOf]
  );
  const visibleSchedules = useMemo(
    () => (bankFilter ? schedules.filter((s) => s.bank_id === bankFilter) : schedules),
    [schedules, bankFilter]
  );

  const [granularity, setGranularity] = useState('month');
  const [periodKey, setPeriodKey] = useState(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [editingDividend, setEditingDividend] = useState(null);

  const chartPeriods = useMemo(
    () =>
      groupByPeriod(dividends, granularity === 'year').map(({ key, items }) => {
        const byBank = new Map();
        items.forEach((d) => {
          const bank = bankOf(d.asset);
          const id = bank?.id || 'sem-banco';
          const part = byBank.get(id) || { id, name: bank?.name || '', color: bank?.color_hex || 'var(--teal)', value: 0 };
          part.value += amountBrl(d);
          byBank.set(id, part);
        });
        return {
          key,
          label: periodShortLabel(key),
          fullLabel: periodTitle(key),
          total: sumBrl(items),
          // De cima para baixo na barra, em ordem alfabetica inversa.
          parts: [...byBank.values()].sort((a, b) => b.name.localeCompare(a.name, 'pt-BR')),
        };
      }),
    [dividends, granularity, bankOf]
  );

  const today = localIsoDate();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const monthNumber = Number(today.slice(5, 7));
  const previousMonth = previousMonthKey(currentMonth);
  const windowStart = lastTwelveMonthsStart(today);

  const monthTotal = sumBrl(dividends.filter((d) => d.date.startsWith(currentMonth)));
  const previousMonthTotal = sumBrl(dividends.filter((d) => d.date.startsWith(previousMonth)));
  const yearTotal = sumBrl(dividends.filter((d) => d.date.startsWith(currentYear)));
  const yearComparison = comparePeriod(dividends, currentYear, today);
  const recent = dividends.filter((d) => d.date >= windowStart && d.date <= today);
  const recentTotal = sumBrl(recent);

  const quotesByCurrency = useMemo(
    () => Object.fromEntries((quotesData?.quotes || []).map((q) => [q.currency, q.brl_rate])),
    [quotesData]
  );
  const pending = visibleSchedules.filter(
    (s) => s.active && s.next_due_date.startsWith(currentMonth) && s.next_due_date >= today
  );
  const pendingTotal = pending.reduce((total, s) => {
    const currency = s.asset?.currency || assets.find((a) => a.id === s.asset_id)?.currency;
    const rate = currency && currency !== 'BRL' ? quotesByCurrency[currency] : null;
    return total + (s.expected_amount || 0) * (rate || 1);
  }, 0);

  const positionByAssetId = useMemo(
    () => new Map((summaryData?.assets || []).map((a) => [a.id, a.position])),
    [summaryData]
  );
  const payers = payersByAsset(recent, positionByAssetId, { history: allDividends, schedules, windowStart });

  function reload() {
    reloadAssets();
    reloadSchedules();
    reloadSummary();
    reloadBanks();
    reloadAccounts();
    reloadDividends();
  }

  function openDividend(dividend) {
    setEditingDividend(dividend);
    setDividendModalOpen(true);
  }

  function openSchedule(schedule) {
    setEditingSchedule(schedule);
    setScheduleModalOpen(true);
  }

  function closeAndReload(close) {
    close(false);
    reload();
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Dividendos &amp; Proventos</h1>
        <NewDividendMenu onSingle={() => openDividend(null)} onRecurring={() => openSchedule(null)} />
      </div>

      {payingBanks.length > 1 && (
        <div className="dv-tabs" role="group" aria-label="Filtrar por banco">
          {[{ id: '', name: 'Todos os bancos', color_hex: 'var(--ink-faint)' }, ...payingBanks].map((b) => (
            <button
              type="button"
              key={b.id}
              className={bankFilter === b.id ? 'active' : ''}
              aria-pressed={bankFilter === b.id}
              onClick={() => setSelectedBankId(b.id)}
            >
              <span className="dv-swatch" style={{ background: b.color_hex }} />
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard
          label={`Recebido em ${monthLabelFull(monthNumber).toLowerCase()}`}
          value={fmt(monthTotal)}
          stripe="#0F5C5C"
          loading={loadingDividends}
          {...deltaProps(
            variation(monthTotal, previousMonthTotal),
            `vs ${monthLabelFull(Number(previousMonth.slice(5))).toLowerCase()}`
          )}
        />
        <StatCard
          label={`Recebido em ${currentYear}`}
          value={fmt(yearTotal)}
          stripe="#C0912F"
          loading={loadingDividends}
          onExpand={yearTotal > 0 ? () => setPeriodKey(currentYear) : undefined}
          {...deltaProps(yearComparison?.pct ?? null, yearComparison?.label)}
        />
        <StatCard
          label="Média mensal (12 meses)"
          value={fmt(recentTotal / 12)}
          detail={`${fmt(recentTotal)} no período`}
          stripe="#3D7A8C"
          loading={loadingDividends}
        />
        <StatCard
          label="A cair ainda este mês"
          value={fmt(pendingTotal)}
          detail={`${pending.length} ${pending.length === 1 ? 'pagamento previsto' : 'pagamentos previstos'}`}
          stripe="#A6432C"
          loading={schedulesLoading && !schedulesData}
        />
      </div>

      <section className="card dv-card" style={{ marginBottom: 20 }}>
        <div className="dv-head">
          <h2 className="dv-title">Histórico de dividendos</h2>
          <div className="dv-toggle">
            <button type="button" className={granularity === 'month' ? 'active' : ''} onClick={() => setGranularity('month')}>
              Mensal
            </button>
            <button type="button" className={granularity === 'year' ? 'active' : ''} onClick={() => setGranularity('year')}>
              Anual
            </button>
          </div>
        </div>
        <div className="dv-chart">
          {loadingDividends ? (
            <Skeleton width="100%" height={260} radius={8} />
          ) : chartPeriods.length === 0 ? (
            <div className="empty-state">Nenhum recebimento registrado ainda.</div>
          ) : (
            <DividendsHistoryChart key={granularity} periods={chartPeriods} onBarClick={setPeriodKey} />
          )}
        </div>
      </section>

      <div className="dv-columns">
        <RecurringCard
          schedules={visibleSchedules}
          loading={schedulesLoading && !schedulesData}
          banksById={banksById}
          onSelect={openSchedule}
        />
        <TopPayersCard payers={payers} loading={loadingDividends} yieldLoading={summaryLoading} bankOf={bankOf} />
      </div>

      {periodKey && (
        <DividendPeriodDetailModal
          // Escondido (sem desmontar) enquanto um recebimento e' editado, para
          // voltar no mesmo ponto e o ESC nao fechar os dois juntos.
          open={!dividendModalOpen}
          periodKey={periodKey}
          onPeriodChange={setPeriodKey}
          onClose={() => setPeriodKey(null)}
          dividends={allDividends}
          pageBankId={bankFilter}
          bankOf={bankOf}
          onEdit={openDividend}
        />
      )}

      <DividendScheduleModal
        open={scheduleModalOpen}
        schedule={editingSchedule}
        assets={assets}
        bankOf={bankOf}
        onClose={() => setScheduleModalOpen(false)}
        onSaved={() => closeAndReload(setScheduleModalOpen)}
      />

      <DividendModal
        open={dividendModalOpen}
        dividend={editingDividend}
        assets={assets}
        bankOf={bankOf}
        onClose={() => setDividendModalOpen(false)}
        onSaved={() => closeAndReload(setDividendModalOpen)}
        onDeleted={() => closeAndReload(setDividendModalOpen)}
      />
    </div>
  );
}
