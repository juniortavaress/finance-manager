import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;

export default function IncomeExpenseChart({ periods, granularity, onSelectPeriod }) {
  const [highlightedYear, setHighlightedYear] = useState(null);

  const data = periods.map((p) => ({
    key: granularity === 'yearly' ? String(p.year) : `${p.year}-${p.month}`,
    label: granularity === 'yearly' ? String(p.year) : monthLabel(p.month),
    income: p.income,
    expense: p.expense,
    year: p.year,
    month: p.month,
  }));

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);

  function handleClick(e) {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload) return;
    if (granularity === 'monthly') {
      onSelectPeriod?.({ year: payload.year, month: payload.month });
    } else {
      setHighlightedYear((prev) => (prev === payload.year ? null : payload.year));
    }
  }

  const highlighted = granularity === 'yearly' ? data.find((d) => d.year === highlightedYear) : null;

  return (
    <div>
      <ChartScrollContainer width={width} height={180}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} onClick={handleClick} style={{ cursor: 'pointer' }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
            <XAxis
              dataKey="label"
              tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
              axisLine={{ stroke: CHART_COLORS.line }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<ChartTooltip formatter={fmt} />} cursor={{ fill: CHART_COLORS.bg }} />
            <Bar dataKey="income" name="Receita" fill={CHART_COLORS.teal} radius={[2, 2, 0, 0]} barSize={9} />
            <Bar dataKey="expense" name="Despesa" fill={CHART_COLORS.brick} radius={[2, 2, 0, 0]} barSize={9} />
          </BarChart>
        </ResponsiveContainer>
      </ChartScrollContainer>
      {highlighted && (
        <div className="chart-year-summary">
          <span>{highlighted.label}</span>
          <span>
            Receita <strong className="num">{fmt(highlighted.income)}</strong>
          </span>
          <span>
            Despesa <strong className="num">{fmt(highlighted.expense)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
