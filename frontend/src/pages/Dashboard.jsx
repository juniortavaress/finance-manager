import { useState } from 'react';
import { dashboardApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, monthLabel, monthLabelFull, fmtDateShort } from '../utils/format';
import TransactionModal from '../components/modals/TransactionModal';
import TransactionsDrilldownModal from '../components/modals/TransactionsDrilldownModal';
import InvoicesDrilldownModal from '../components/modals/InvoicesDrilldownModal';
import IncomeExpenseChart from '../components/charts/IncomeExpenseChart';
import BalanceEvolutionChart from '../components/charts/BalanceEvolutionChart';
import PeriodGranularitySelect from '../components/PeriodGranularitySelect';
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

  const { data: summary, reload: reloadSummary } = useFetch(
    () => dashboardApi.summary(period.year, period.month),
    [period.year, period.month]
  );
  const { data: catData, reload: reloadCats } = useFetch(
    () => dashboardApi.spendingByCategory(period.year, period.month),
    [period.year, period.month]
  );
  const { data: bankData, reload: reloadBanks } = useFetch(() => dashboardApi.balanceByBank(), []);
  const { data: rdData } = useFetch(() => dashboardApi.incomeVsExpense(rdGranularity), [rdGranularity]);
  const { data: evoData } = useFetch(() => dashboardApi.balanceEvolution(evoGranularity), [evoGranularity]);
  const { data: txData, reload: reloadTx } = useFetch(() => dashboardApi.recentTransactions(5), []);
  const { data: invData, reload: reloadInvoices } = useFetch(() => dashboardApi.upcomingInvoices(), []);

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
  const catMax = Math.max(1, ...categories.map((c) => c.total));

  const rdPeriods = rdData?.periods || [];
  const evoPeriods = evoData?.periods || [];

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="period">
          <button
            onClick={() => shiftMonth(-1)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
          >
            ◀
          </button>{' '}
          {monthLabelFull(period.month)} {period.year}{' '}
          <button
            onClick={() => shiftMonth(1)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
          >
            ▶
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': 'var(--teal)' }}>
          <div className="label">Saldo total</div>
          <div className="value num">{fmt(summary?.saldo_total ?? 0)}</div>
          <div className="delta">contas correntes</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': 'var(--gold)' }}>
          <div className="label">Receitas do mês</div>
          <div className="value num">{fmt(summary?.receitas_mes ?? 0)}</div>
          <div className="delta">{summary?.receitas_mes_qtd ?? 0} entradas</div>
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
          <div className="value num">{fmt(summary?.despesas_mes ?? 0)}</div>
          <div className="delta">
            {summary?.despesas_variacao_pct != null
              ? `${summary.despesas_variacao_pct >= 0 ? '↑' : '↓'} ${Math.abs(summary.despesas_variacao_pct).toFixed(1)}% vs mês anterior`
              : 'sem dado do mês anterior'}
          </div>
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
          <div className="value num">{fmt(summary?.faturas_abertas_total ?? 0)}</div>
          <div className="delta">{summary?.faturas_abertas_qtd ?? 0} faturas</div>
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
          {categories.length === 0 && <div className="empty-state">Nenhum gasto neste período.</div>}
          {categories.map((c) => (
            <div className="hbar-row" key={c.id}>
              <div className="hbar-top">
                <span className="cat">
                  <span className="catdot" style={{ background: c.color_hex }} />
                  {c.name}
                </span>
                <span className="val num">{fmt(c.total)}</span>
              </div>
              <div className="hbar-track">
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
          {(bankData?.banks || []).length === 0 && <div className="empty-state">Nenhum banco cadastrado.</div>}
          {(bankData?.banks || []).map(({ bank, balance }) => (
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
          <IncomeExpenseChart
            periods={rdPeriods}
            granularity={rdGranularity}
            onSelectPeriod={(p) => setPeriod(p)}
          />
        </div>
        <div className="card">
          <h3>
            Evolução do saldo
            <PeriodGranularitySelect value={evoGranularity} onChange={setEvoGranularity} />
          </h3>
          <BalanceEvolutionChart
            periods={evoPeriods}
            granularity={evoGranularity}
            onSelectPeriod={(p) => setPeriod(p)}
          />
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
          {(txData?.transactions || []).length === 0 && (
            <div className="empty-state">Nenhuma transação ainda.</div>
          )}
          {(txData?.transactions || []).map((t) => {
            const pos = t.type === 'income';
            const category = categoryById(t.category_id) || t.category;
            return (
              <div className="tx-row" key={t.id}>
                <div className="tx-left">
                  <div className="tx-icon" style={{ background: pos ? 'var(--teal-soft)' : 'var(--bg)' }}>
                    {category?.icon || '📁'}
                  </div>
                  <div>
                    <div className="tx-desc">{t.description}</div>
                    <div className="tx-meta">
                      {t.account?.name} · {fmtDateShort(t.date)}
                    </div>
                  </div>
                </div>
                <div className={`tx-val num ${pos ? 'pos' : 'neg'}`}>{fmt(pos ? t.amount : -t.amount)}</div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>Faturas próximas</h3>
          {(invData?.invoices || []).length === 0 && <div className="empty-state">Nenhuma fatura em aberto.</div>}
          {(invData?.invoices || []).map((inv) => {
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
