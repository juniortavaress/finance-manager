import { useState } from 'react';
import { dashboardApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, monthLabel, monthLabelFull, fmtDateShort } from '../utils/format';
import { hexToRgba } from '../utils/color';
import TransactionModal from '../components/modals/TransactionModal';
import TransactionsDrilldownModal from '../components/modals/TransactionsDrilldownModal';
import InvoicesDrilldownModal from '../components/modals/InvoicesDrilldownModal';
import IncomeExpenseChart from '../components/charts/IncomeExpenseChart';
import BalanceEvolutionChart from '../components/charts/BalanceEvolutionChart';
import PeriodGranularitySelect from '../components/PeriodGranularitySelect';
import Skeleton from '../components/Skeleton';
import AnimatedNumber from '../components/AnimatedNumber';
import { IconChevronDown } from '../components/icons';

function todayPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function Dashboard() {
  const { categoryById } = useData();
  const [period, setPeriod] = useState(todayPeriod());
  const [modalOpen, setModalOpen] = useState(false);
  const [rdGranularity, setRdGranularity] = useState('monthly');
  const [evoGranularity, setEvoGranularity] = useState('monthly');
  const [drilldown, setDrilldown] = useState(null);

  const { data: summary, initialLoading: summaryLoading, reload: reloadSummary } = useFetch(
    () => dashboardApi.summary(period.year, period.month),
    [period.year, period.month]
  );
  const { data: catData, initialLoading: catsLoading, reload: reloadCats } = useFetch(
    () => dashboardApi.spendingByCategory(period.year, period.month),
    [period.year, period.month]
  );
  const { data: bankData, initialLoading: banksLoading, reload: reloadBanks } = useFetch(() => dashboardApi.balanceByBank(), []);
  const { data: rdData, initialLoading: rdLoading } = useFetch(() => dashboardApi.incomeVsExpense(rdGranularity), [rdGranularity]);
  const { data: evoData, initialLoading: evoLoading } = useFetch(() => dashboardApi.balanceEvolution(evoGranularity), [evoGranularity]);
  const { data: txData, initialLoading: txLoading, reload: reloadTx } = useFetch(() => dashboardApi.recentTransactions(5), []);
  const { data: invData, initialLoading: invLoading, reload: reloadInvoices } = useFetch(() => dashboardApi.upcomingInvoices(), []);

  const latestPeriod = todayPeriod();
  const atLatestPeriod = period.year === latestPeriod.year && period.month === latestPeriod.month;

  function shiftMonth(delta) {
    setPeriod((p) => {
      let month = p.month + delta;
      let year = p.year;
      if (month > 12) {
        month = 1;
        year += 1;
      } else if (month < 1) {
        month = 12;
        year -= 1;
      }
      if (year > latestPeriod.year || (year === latestPeriod.year && month > latestPeriod.month)) {
        return { year: latestPeriod.year, month: latestPeriod.month };
      }
      return { year, month };
    });
  }

  function handleCreated() {
    reloadSummary();
    reloadCats();
    reloadBanks();
    reloadTx();
    reloadInvoices();
  }

  const categories = catData?.categories || [];
  const catMax = Math.max(1, ...categories.map((c) => c.total), ...categories.map((c) => c.budget_amount || 0));

  const rdPeriods = rdData?.periods || [];
  const evoPeriods = evoData?.periods || [];

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="period period-nav">
          <button type="button" className="period-nav-btn" onClick={() => shiftMonth(-1)}>
            ◀
          </button>
          <span>
            {monthLabelFull(period.month)} {period.year}
          </span>
          <button
            type="button"
            className="period-nav-btn"
            onClick={() => shiftMonth(1)}
            disabled={atLatestPeriod}
          >
            ▶
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': 'var(--teal)' }}>
          <div className="label">Saldo total</div>
          {summaryLoading ? (
            <>
              <Skeleton width={110} height={24} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={12} />
            </>
          ) : (
            <>
              <div className="value num"><AnimatedNumber value={summary?.saldo_total ?? 0} /></div>
              <div className="delta">contas correntes</div>
            </>
          )}
        </div>
        <div className="card stat-card" style={{ '--stripe': 'var(--gold)' }}>
          <div className="label">Receitas do mês</div>
          {summaryLoading ? (
            <>
              <Skeleton width={110} height={24} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={12} />
            </>
          ) : (
            <>
              <div className="value num"><AnimatedNumber value={summary?.receitas_mes ?? 0} /></div>
              <div className="delta">{summary?.receitas_mes_qtd ?? 0} entradas</div>
            </>
          )}
          <button
            type="button"
            className="stat-card-expand"
            title="Ver transações"
            onClick={() => setDrilldown({ kind: 'income' })}
          >
            <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
        <div className="card stat-card" style={{ '--stripe': 'var(--brick)' }}>
          <div className="label">Despesas do mês</div>
          {summaryLoading ? (
            <>
              <Skeleton width={110} height={24} style={{ marginBottom: 6 }} />
              <Skeleton width={140} height={12} />
            </>
          ) : (
            <>
              <div className="value num"><AnimatedNumber value={summary?.despesas_mes ?? 0} /></div>
              <div className="delta">
                {summary?.despesas_variacao_pct != null
                  ? `${summary.despesas_variacao_pct >= 0 ? '↑' : '↓'} ${Math.abs(summary.despesas_variacao_pct).toFixed(1)}% vs mês anterior`
                  : 'sem dado do mês anterior'}
              </div>
            </>
          )}
          <button
            type="button"
            className="stat-card-expand"
            title="Ver transações"
            onClick={() => setDrilldown({ kind: 'expense' })}
          >
            <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
        <div className="card stat-card" style={{ '--stripe': 'var(--ink-soft)' }}>
          <div className="label">Faturas em aberto</div>
          {summaryLoading ? (
            <>
              <Skeleton width={110} height={24} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={12} />
            </>
          ) : (
            <>
              <div className="value num"><AnimatedNumber value={summary?.faturas_abertas_total ?? 0} /></div>
              <div className="delta">{summary?.faturas_abertas_qtd ?? 0} faturas</div>
            </>
          )}
          <button
            type="button"
            className="stat-card-expand"
            title="Ver faturas"
            onClick={() => setDrilldown({ kind: 'invoices' })}
          >
            <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3>Gastos por categoria — {monthLabel(period.month).toLowerCase()}</h3>
          {catsLoading &&
            [0, 1, 2, 3].map((i) => (
              <div className="hbar-row" key={i}>
                <div className="hbar-top">
                  <Skeleton width={90} height={12} />
                  <Skeleton width={60} height={12} />
                </div>
                <Skeleton width="100%" height={8} radius={5} />
              </div>
            ))}
          {!catsLoading && categories.length === 0 && <div className="empty-state">Nenhum gasto neste período.</div>}
          {!catsLoading && categories.map((c) => (
            <div className="hbar-row" key={c.id}>
              <div className="hbar-top">
                <span className="cat">
                  <span className="catdot" style={{ background: c.color_hex }} />
                  {c.name}
                </span>
                <span className="val num">
                  <AnimatedNumber value={c.total} />
                  {c.budget_amount != null && (
                    <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> / {fmt(c.budget_amount)}</span>
                  )}
                </span>
              </div>
              <div className="hbar-track">
                {c.budget_amount != null && (
                  <div
                    className="hbar-goal"
                    style={{ width: `${Math.min((c.budget_amount / catMax) * 100, 100)}%`, background: hexToRgba(c.color_hex, 0.25) }}
                  />
                )}
                <div
                  className="hbar-fill"
                  style={{ width: `${(c.total / catMax) * 100}%`, background: c.color_hex }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Saldo por banco</h3>
          {banksLoading &&
            [0, 1, 2].map((i) => (
              <div className="bank-row" key={i}>
                <div className="bank-id">
                  <Skeleton width={8} height={8} radius={2} />
                  <div>
                    <Skeleton width={100} height={13} style={{ marginBottom: 5 }} />
                    <Skeleton width={80} height={11} />
                  </div>
                </div>
                <Skeleton width={70} height={14} />
              </div>
            ))}
          {!banksLoading && (bankData?.banks || []).length === 0 && (
            <div className="empty-state">Nenhum banco cadastrado.</div>
          )}
          {!banksLoading &&
            (bankData?.banks || []).map(({ bank, balance }) => (
              <div className="bank-row" key={bank.id}>
                <div className="bank-id">
                  <span className="bank-chip" style={{ background: bank.color_hex }} />
                  <div>
                    <div className="bank-name">{bank.name}</div>
                    <div className="bank-sub">Conta corrente</div>
                  </div>
                </div>
                <div className="bank-val num">{fmt(balance)}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3>
            Receitas x Despesas
            <PeriodGranularitySelect value={rdGranularity} onChange={setRdGranularity} />
          </h3>
          {rdLoading ? (
            <Skeleton width="100%" height={180} radius={8} />
          ) : (
            <IncomeExpenseChart
              periods={rdPeriods}
              granularity={rdGranularity}
              selectedPeriod={period}
              onSelectPeriod={(p) => setPeriod(p)}
            />
          )}
        </div>
        <div className="card">
          <h3>
            Evolução do saldo
            <PeriodGranularitySelect value={evoGranularity} onChange={setEvoGranularity} />
          </h3>
          {evoLoading ? (
            <Skeleton width="100%" height={180} radius={8} />
          ) : (
            <BalanceEvolutionChart
              periods={evoPeriods}
              granularity={evoGranularity}
              onSelectPeriod={(p) => setPeriod(p)}
            />
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>
            Últimas transações
            <button className="action" onClick={() => setModalOpen(true)}>
              + nova →
            </button>
          </h3>
          {txLoading &&
            [0, 1, 2].map((i) => (
              <div className="tx-row" key={i}>
                <div className="tx-left">
                  <Skeleton width={34} height={34} radius={9} />
                  <div>
                    <Skeleton width={130} height={13} style={{ marginBottom: 5 }} />
                    <Skeleton width={100} height={11} />
                  </div>
                </div>
                <Skeleton width={70} height={14} />
              </div>
            ))}
          {!txLoading && (txData?.transactions || []).length === 0 && (
            <div className="empty-state">Nenhuma transação ainda.</div>
          )}
          {!txLoading &&
            (txData?.transactions || []).map((t) => {
              const pos = t.type === 'income';
              const category = categoryById(t.category_id) || t.category;
              return (
                <div className="tx-row" key={t.id}>
                  <div className="tx-left">
                    <div
                      className="tx-icon"
                      style={{ background: t.is_transfer ? 'var(--bg)' : pos ? 'var(--teal-soft)' : 'var(--bg)' }}
                    >
                      {t.is_transfer ? '🔁' : category?.icon || '📁'}
                    </div>
                    <div>
                      <div className="tx-desc">{t.description}</div>
                      <div className="tx-meta">
                        {t.account?.name} · {fmtDateShort(t.date)}
                      </div>
                    </div>
                  </div>
                  <div className={`tx-val num ${t.is_transfer ? '' : pos ? 'pos' : 'neg'}`}>
                    {fmt(pos ? t.amount : -t.amount)}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="card">
          <h3>Faturas próximas</h3>
          {invLoading &&
            [0, 1, 2].map((i) => (
              <div className="fat-row" key={i}>
                <div>
                  <Skeleton width={120} height={13} style={{ marginBottom: 5 }} />
                  <Skeleton width={90} height={11} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Skeleton width={70} height={14} style={{ marginBottom: 5 }} />
                  <Skeleton width={50} height={16} radius={20} />
                </div>
              </div>
            ))}
          {!invLoading && (invData?.invoices || []).length === 0 && (
            <div className="empty-state">Nenhuma fatura em aberto.</div>
          )}
          {!invLoading &&
            (invData?.invoices || []).map((inv) => {
            const isLate = inv.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div className="fat-row" key={inv.id}>
                <div>
                  <div className="fat-bank">{inv.bank_name} · cartão</div>
                  <div className="fat-due">vence {fmtDateShort(inv.due_date)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="fat-val num">{fmt(inv.outstanding_amount)}</div>
                  <span className={`badge ${isLate ? 'danger' : 'warn'}`}>{isLate ? 'atrasada' : 'aberta'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          handleCreated();
        }}
      />

      {drilldown?.kind === 'income' && (
        <TransactionsDrilldownModal
          open
          onClose={() => setDrilldown(null)}
          title="Receitas do mês"
          year={period.year}
          month={period.month}
          type="income"
        />
      )}
      {drilldown?.kind === 'expense' && (
        <TransactionsDrilldownModal
          open
          onClose={() => setDrilldown(null)}
          title="Despesas do mês"
          year={period.year}
          month={period.month}
          type="expense"
        />
      )}
      {drilldown?.kind === 'invoices' && (
        <InvoicesDrilldownModal open onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
