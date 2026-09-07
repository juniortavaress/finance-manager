import { useMemo, useState } from 'react';
import { dividendsApi, investmentsApi, quotesApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, fmtDateShort, monthLabel, monthLabelFull } from '../utils/format';
import DividendScheduleModal from '../components/modals/DividendScheduleModal';
import DividendModal from '../components/modals/DividendModal';
import DividendPeriodDetailModal from '../components/modals/DividendPeriodDetailModal';
import DividendsHistoryChart from '../components/charts/DividendsHistoryChart';
import Skeleton from '../components/Skeleton';
import LoadMoreButton from '../components/LoadMoreButton';

const PAGE_SIZE = 15;

const KIND_LABELS = {
  dividendo: 'Dividendo',
  rendimento: 'Rendimento (FII)',
  jcp: 'JCP',
  cupom: 'Cupom',
  bonificacao: 'Bonificação',
  outro: 'Outro',
};

const FREQUENCY_LABELS = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function initials(text) {
  return (text || '?').slice(0, 2).toUpperCase();
}

export default function Dividends() {
  const { data: assetsData, reload: reloadAssets } = useFetch((signal) => investmentsApi.listAssetsLight(signal), []);
  const { data: schedulesData, loading: schedulesLoading, reload: reloadSchedules } = useFetch(
    () => dividendsApi.listSchedules(),
    []
  );
  const { data: quotesData } = useFetch(() => quotesApi.list(), []);
  const { investmentAccounts, bankById, reloadAll } = useData();

  // Uma UNICA chamada busca todo o historico (sem paginacao no backend) -
  // alimenta o grafico, os totais do mes/ano e a lista "Historico de
  // recebimentos" (paginada so' no CLIENTE abaixo). Antes eram 2 chamadas
  // paralelas quase identicas (uma paginada, uma com limit alto so' pro
  // grafico) competindo pela mesma conexao de banco ao mesmo tempo que
  // /dividends/schedules - foi isso que deixou a pagina lenta.
  const { data: dividendsData, reload: reloadDividends, loading: dividendsLoading } = useFetch(
    () => dividendsApi.list({ limit: 100000 }),
    []
  );
  const allDividends = dividendsData?.dividends || [];

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const dividendsAccumulated = useMemo(() => allDividends.slice(0, visibleCount), [allDividends, visibleCount]);

  const [chartGranularity, setChartGranularity] = useState('month');
  const [periodDetail, setPeriodDetail] = useState(null);

  const chartPeriods = useMemo(() => {
    const rows = allDividends;
    const map = new Map();
    rows.forEach((d) => {
      const [year, month] = d.date.split('-').map(Number);
      const key = chartGranularity === 'month' ? `${year}-${month}` : `${year}`;
      const label = chartGranularity === 'month' ? monthLabel(month) : String(year);
      const fullLabel = chartGranularity === 'month' ? `${monthLabelFull(month)} ${year}` : String(year);
      const amount = d.amount_brl ?? d.amount;

      let period = map.get(key);
      if (!period) {
        period = { key, label, fullLabel, total: 0, byAsset: new Map() };
        map.set(key, period);
      }
      period.total += amount;

      const assetKey = d.asset_id;
      const assetEntry = period.byAsset.get(assetKey) || {
        assetId: assetKey,
        code: d.asset?.code,
        name: d.asset?.name,
        total: 0,
      };
      assetEntry.total += amount;
      period.byAsset.set(assetKey, assetEntry);
    });

    return [...map.values()]
      .map((p) => ({ ...p, byAsset: [...p.byAsset.values()] }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [allDividends, chartGranularity]);

  const quotesByCurrency = useMemo(() => {
    const map = {};
    (quotesData?.quotes || []).forEach((q) => {
      map[q.currency] = q.brl_rate;
    });
    return map;
  }, [quotesData]);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [editingDividend, setEditingDividend] = useState(null);

  const assets = assetsData?.assets || [];
  const schedules = schedulesData?.dividend_schedules || [];
  const dividends = dividendsAccumulated;

  function reload() {
    reloadAssets();
    reloadSchedules();
    reloadAll();
    reloadDividends();
    setVisibleCount(PAGE_SIZE);
  }

  function bankNameFor(assetOrSnapshot) {
    const account = investmentAccounts.find(
      (a) => a.investment_account?.id === assetOrSnapshot.investment_account_id
    );
    const bank = account ? bankById(account.bank_id) : null;
    return bank?.name || '';
  }

  const today = todayIso();
  const currentMonth = today.slice(0, 7);

  const recebidoMes = dividendsData?.recebido_mes || 0;
  const recebidoAno = dividendsData?.recebido_ano || 0;

  const aCairMes = useMemo(() => {
    const todayDay = new Date().getDate();
    return schedules
      .filter((s) => s.active && s.next_due_date.slice(0, 7) === currentMonth && Number(s.next_due_date.slice(8, 10)) >= todayDay)
      .reduce((s, sch) => {
        const asset = assets.find((a) => a.id === sch.asset_id);
        const quantity = asset?.position?.quantity || 0;
        const value = sch.calc_mode === 'fixed' ? sch.fixed_amount || 0 : (sch.amount_per_share || 0) * quantity;
        const rate = asset?.currency && asset.currency !== 'BRL' ? quotesByCurrency[asset.currency] : null;
        return s + (rate ? value * rate : value);
      }, 0);
  }, [schedules, assets, currentMonth, quotesByCurrency]);

  function scheduleValue(schedule) {
    const asset = assets.find((a) => a.id === schedule.asset_id);
    const quantity = asset?.position?.quantity || 0;
    return schedule.calc_mode === 'fixed' ? schedule.fixed_amount || 0 : (schedule.amount_per_share || 0) * quantity;
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Dividendos &amp; Proventos</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div
            className="period"
            onClick={() => {
              setEditingDividend(null);
              setDividendModalOpen(true);
            }}
          >
            + dividendo avulso
          </div>
          <div
            className="period"
            style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
            onClick={() => {
              setEditingSchedule(null);
              setScheduleModalOpen(true);
            }}
          >
            + novo provento recorrente
          </div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Recebido este mês</div>
          {dividendsLoading ? (
            <Skeleton width={110} height={24} />
          ) : (
            <div className="value num">{fmt(recebidoMes)}</div>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Recebido este ano</div>
          {dividendsLoading ? (
            <Skeleton width={110} height={24} />
          ) : (
            <div className="value num">{fmt(recebidoAno)}</div>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">A cair ainda este mês</div>
          {schedulesLoading ? <Skeleton width={110} height={24} /> : <div className="value num">{fmt(aCairMes)}</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Histórico de dividendos</span>
          <div className="seg" style={{ maxWidth: 148, padding: 2 }}>
            <div
              className={`seg-opt${chartGranularity === 'month' ? ' active' : ''}`}
              onClick={() => setChartGranularity('month')}
              style={{ padding: '4px 8px', fontSize: 11.5, fontWeight: 500 }}
            >
              Mensal
            </div>
            <div
              className={`seg-opt${chartGranularity === 'year' ? ' active' : ''}`}
              onClick={() => setChartGranularity('year')}
              style={{ padding: '4px 8px', fontSize: 11.5, fontWeight: 500 }}
            >
              Anual
            </div>
          </div>
        </h3>
        {dividendsLoading ? (
          <Skeleton width="100%" height={180} radius={8} />
        ) : chartPeriods.length === 0 ? (
          <div className="empty-state">Nenhum recebimento registrado ainda.</div>
        ) : (
          <DividendsHistoryChart periods={chartPeriods} onBarClick={setPeriodDetail} />
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Proventos recorrentes cadastrados</h3>
        {schedulesLoading &&
          [0, 1, 2].map((i) => (
            <div className="div-row" key={i}>
              <div className="div-left">
                <Skeleton width={34} height={34} radius={9} />
                <div>
                  <Skeleton width={90} height={13} style={{ marginBottom: 5 }} />
                  <Skeleton width={160} height={11} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Skeleton width={70} height={14} style={{ marginBottom: 5 }} />
                <Skeleton width={80} height={11} />
              </div>
            </div>
          ))}
        {!schedulesLoading && schedules.length === 0 && (
          <div className="empty-state">Nenhum provento recorrente cadastrado ainda.</div>
        )}
        {!schedulesLoading && schedules.map((s) => {
          const asset = assets.find((a) => a.id === s.asset_id) || s.asset;
          return (
            <div
              className="div-row"
              key={s.id}
              style={{ cursor: 'pointer', opacity: s.active ? 1 : 0.5 }}
              onClick={() => {
                setEditingSchedule(s);
                setScheduleModalOpen(true);
              }}
            >
              <div className="div-left">
                <div className="div-icon">{initials(asset?.code || asset?.name)}</div>
                <div>
                  <div className="div-desc">{asset?.code || asset?.name}</div>
                  <div className="div-meta">
                    {KIND_LABELS[s.kind]} · {FREQUENCY_LABELS[s.frequency]} · {bankNameFor(asset || {})}
                    {!s.active ? ' · pausado' : ''}
                  </div>
                </div>
              </div>
              <div className="div-right">
                <div>
                  <div className="div-val">{fmt(scheduleValue(s), asset?.currency)}</div>
                  <div className="div-next">todo dia {s.day_of_month}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Histórico de recebimentos</h3>
        {dividendsLoading &&
          dividends.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <div className="div-row" key={i}>
              <div className="div-left">
                <Skeleton width={34} height={34} radius={9} />
                <div>
                  <Skeleton width={90} height={13} style={{ marginBottom: 5 }} />
                  <Skeleton width={150} height={11} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Skeleton width={70} height={14} style={{ marginBottom: 5 }} />
                <Skeleton width={60} height={11} />
              </div>
            </div>
          ))}
        {!dividendsLoading && dividends.length === 0 && (
          <div className="empty-state">Nenhum recebimento registrado ainda.</div>
        )}
        {dividends.map((d) => {
          const asset = assets.find((a) => a.id === d.asset_id) || d.asset;
          return (
            <div
              className="div-row"
              key={d.id}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setEditingDividend(d);
                setDividendModalOpen(true);
              }}
            >
              <div className="div-left">
                <div className="div-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                  {initials(asset?.code || asset?.name)}
                </div>
                <div>
                  <div className="div-desc">{asset?.code || asset?.name}</div>
                  <div className="div-meta">
                    recebido em {fmtDateShort(d.date)} · {KIND_LABELS[d.kind]}
                  </div>
                </div>
              </div>
              <div className="div-right">
                <div className="div-val">{fmt(d.amount, d.currency)}</div>
                {d.currency && d.currency !== 'BRL' && (
                  <div className="div-next">{fmt(d.amount_brl)}</div>
                )}
              </div>
            </div>
          );
        })}
        <LoadMoreButton
          shown={dividends.length}
          total={allDividends.length}
          loading={false}
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
        />
      </div>

      <DividendScheduleModal
        open={scheduleModalOpen}
        schedule={editingSchedule}
        assets={assets}
        bankNameFor={bankNameFor}
        onClose={() => setScheduleModalOpen(false)}
        onSaved={() => {
          setScheduleModalOpen(false);
          reload();
        }}
      />

      <DividendModal
        open={dividendModalOpen}
        dividend={editingDividend}
        assets={assets}
        bankNameFor={bankNameFor}
        onClose={() => setDividendModalOpen(false)}
        onSaved={() => {
          setDividendModalOpen(false);
          reload();
        }}
        onDeleted={() => {
          setDividendModalOpen(false);
          reload();
        }}
      />

      <DividendPeriodDetailModal
        open={!!periodDetail}
        period={periodDetail}
        onClose={() => setPeriodDetail(null)}
      />
    </div>
  );
}
