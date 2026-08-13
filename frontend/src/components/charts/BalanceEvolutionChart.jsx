import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;

export default function BalanceEvolutionChart({ periods, granularity, onSelectPeriod }) {
  const data = periods.map((p) => ({
    label: granularity === 'yearly' ? String(p.year) : monthLabel(p.month),
    balance: p.balance,
    year: p.year,
    month: p.month,
  }));

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);

  function handleClick(state) {
    if (granularity !== 'monthly') return;
    const index = state?.activeTooltipIndex;
    if (index == null || index < 0) return;
    const payload = data[index];
    if (payload) onSelectPeriod?.({ year: payload.year, month: payload.month });
  }

  return (
    <ChartScrollContainer width={width} height={180}>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} onClick={handleClick} style={{ cursor: granularity === 'monthly' ? 'pointer' : 'default' }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.teal} stopOpacity={0.25} />
              <stop offset="100%" stopColor={CHART_COLORS.teal} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
            axisLine={{ stroke: CHART_COLORS.line }}
            tickLine={false}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip content={<ChartTooltip formatter={fmt} />} cursor={{ stroke: CHART_COLORS.teal, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Saldo"
            stroke={CHART_COLORS.teal}
            strokeWidth={2.5}
            fill="url(#balanceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartScrollContainer>
  );
}
