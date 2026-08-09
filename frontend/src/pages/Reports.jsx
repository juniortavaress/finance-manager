import { reportsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { monthLabel } from '../utils/format';

export default function Reports() {
  const { data } = useFetch(() => reportsApi.monthlyComparison(6), []);
  const months = data?.months || [];
  const rdScale = 110 / Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Relatórios</h1>
        <div className="period">período: últimos 6 meses</div>
      </div>
      <div className="card">
        <h3>Comparativo mensal</h3>
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
    </div>
  );
}
