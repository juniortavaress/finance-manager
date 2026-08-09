import { useState } from 'react';
import { dashboardApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt, monthLabel, monthLabelFull, fmtDateShort } from '../utils/format';
import TransactionModal from '../components/modals/TransactionModal';

function todayPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function Dashboard() {
  const { categoryById } = useData();
  const [period, setPeriod] = useState(todayPeriod());
  const [modalOpen, setModalOpen] = useState(false);

  const { data: summary, reload: reloadSummary } = useFetch(
    () => dashboardApi.summary(period.year, period.month),
    [period.year, period.month]
  );
  const { data: catData, reload: reloadCats } = useFetch(
    () => dashboardApi.spendingByCategory(period.year, period.month),
    [period.year, period.month]
  );
  const { data: bankData, reload: reloadBanks } = useFetch(() => dashboardApi.balanceByBank(), []);
  const { data: rdData } = useFetch(() => dashboardApi.incomeVsExpense(6), []);
  const { data: evoData } = useFetch(() => dashboardApi.balanceEvolution(6), []);
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

  const months = rdData?.months || [];
  const rdScale = 110 / Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));

  const evoMonths = evoData?.months || [];
  const evoValues = evoMonths.map((m) => m.balance);
  const evoMin = Math.min(0, ...evoValues);
  const evoMax = Math.max(1, ...evoValues);
  const evoRange = evoMax - evoMin || 1;
  const evoPoints = evoMonths
    .map((m, i) => {
      const x = (i / Math.max(1, evoMonths.length - 1)) * 300;
      const y = 130 - ((m.balance - evoMin) / evoRange) * 120 - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

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
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Saldo total</div>
          <div className="value num">{fmt(summary?.saldo_total ?? 0)}</div>
          <div className="delta">contas correntes</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Receitas do mês</div>
          <div className="value num">{fmt(summary?.receitas_mes ?? 0)}</div>
          <div className="delta">{summary?.receitas_mes_qtd ?? 0} entradas</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#A6432C' }}>
          <div className="label">Despesas do mês</div>
          <div className="value num">{fmt(summary?.despesas_mes ?? 0)}</div>
          <div className="delta">
            {summary?.despesas_variacao_pct != null
              ? `${summary.despesas_variacao_pct >= 0 ? '↑' : '↓'} ${Math.abs(summary.despesas_variacao_pct).toFixed(1)}% vs mês anterior`
              : 'sem dado do mês anterior'}
          </div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#5C6D6A' }}>
          <div className="label">Faturas em aberto</div>
          <div className="value num">{fmt(summary?.faturas_abertas_total ?? 0)}</div>
          <div className="delta">{summary?.faturas_abertas_qtd ?? 0} cartões</div>
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
          <h3>Receitas x Despesas — últimos 6 meses</h3>
          <div className="rd-chart">
            {months.map((m) => (
              <div className="rd-col" key={`${m.year}-${m.month}`}>
                <div className="rd-bars">
                  <div className="rd-bar" style={{ height: `${m.income * rdScale}px`, background: '#0F5C5C' }} />
                  <div className="rd-bar" style={{ height: `${m.expense * rdScale}px`, background: '#A6432C' }} />
                </div>
                <div className="rd-month">{monthLabel(m.month)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Evolução do saldo</h3>
          <div className="line-wrap">
            <svg viewBox="0 0 300 130" width="100%" height="130" preserveAspectRatio="none">
              <polyline points={evoPoints} fill="none" stroke="#0F5C5C" strokeWidth="2.5" />
              <polygon points={`0,130 ${evoPoints} 300,130`} fill="#0F5C5C" opacity="0.08" />
            </svg>
            <div className="line-labels">
              {evoMonths.map((m) => (
                <span key={`${m.year}-${m.month}`}>{monthLabel(m.month)}</span>
              ))}
            </div>
          </div>
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
          {(invData?.invoices || []).map((inv) => (
            <div className="fat-row" key={inv.id}>
              <div>
                <div className="fat-bank">{inv.bank_name} · cartão</div>
                <div className="fat-due">vence dia {new Date(`${inv.due_date}T00:00:00`).getDate()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="fat-val num">{fmt(inv.total_amount)}</div>
                <span className="badge warn">aberta</span>
              </div>
            </div>
          ))}
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
    </div>
  );
}
