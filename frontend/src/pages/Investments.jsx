import { useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useData } from '../context/DataContext';
import { fmt } from '../utils/format';
import NewInvestmentModal from '../components/modals/NewInvestmentModal';

const TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acoes: 'Ações',
  fundos: 'Fundos',
  cripto: 'Cripto',
  outro: 'Outro',
};
const TYPE_COLORS = {
  renda_fixa: '#0F5C5C',
  acoes: '#C0912F',
  fundos: '#7A4FE0',
  cripto: '#A6432C',
  outro: '#8B9A97',
};

export default function Investments() {
  const { data, reload } = useFetch(() => investmentsApi.list(), []);
  const { banks, investmentAccounts, bankById } = useData();
  const [modalOpen, setModalOpen] = useState(false);

  const investments = data?.investments || [];

  const totalInvested = investments.reduce((s, i) => s + i.invested_amount, 0);
  const totalCurrent = investments.reduce((s, i) => s + i.current_amount, 0);
  const rentabilidade = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const byBank = useMemo(() => {
    const map = {};
    investments.forEach((inv) => {
      const account = investmentAccounts.find((a) => a.investment_account?.id === inv.investment_account_id);
      const bankId = account?.bank_id;
      if (!bankId) return;
      map[bankId] = (map[bankId] || 0) + inv.current_amount;
    });
    return Object.entries(map).map(([bankId, total]) => ({ bank: bankById(bankId), total }));
  }, [investments, investmentAccounts, bankById]);

  const byType = useMemo(() => {
    const map = {};
    investments.forEach((inv) => {
      map[inv.type] = (map[inv.type] || 0) + inv.current_amount;
    });
    return Object.entries(map).map(([type, total]) => ({ type, total }));
  }, [investments]);
  const typeMax = Math.max(1, ...byType.map((t) => t.total));

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>
          Investimentos{' '}
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontWeight: 400 }}>
            — versão inicial
          </span>
        </h1>
        <div className="period" onClick={() => setModalOpen(true)}>
          + novo investimento
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Total investido</div>
          <div className="value num">{fmt(totalInvested)}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#C0912F' }}>
          <div className="label">Valor atual</div>
          <div className="value num">{fmt(totalCurrent)}</div>
        </div>
        <div className="card stat-card" style={{ '--stripe': '#0F5C5C' }}>
          <div className="label">Rentabilidade</div>
          <div className="value num">
            {rentabilidade >= 0 ? '+' : ''}
            {rentabilidade.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Por banco / corretora</h3>
          {byBank.length === 0 && <div className="empty-state">Nenhum investimento cadastrado.</div>}
          {byBank.map(({ bank, total }) =>
            bank ? (
              <div className="bank-row" key={bank.id}>
                <div className="bank-id">
                  <span className="bank-chip" style={{ background: bank.color_hex }} />
                  <div className="bank-name">{bank.name}</div>
                </div>
                <div className="bank-val num">{fmt(total)}</div>
              </div>
            ) : null
          )}
        </div>
        <div className="card">
          <h3>Por tipo</h3>
          {byType.map(({ type, total }) => (
            <div className="hbar-row" key={type}>
              <div className="hbar-top">
                <span className="cat">
                  <span className="catdot" style={{ background: TYPE_COLORS[type] }} />
                  {TYPE_LABELS[type]}
                </span>
                <span className="val num">{fmt(total)}</span>
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
      </div>

      <NewInvestmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          reload();
        }}
        banks={banks}
        investmentAccounts={investmentAccounts}
      />
    </div>
  );
}
