import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;

export default function InvestmentEvolutionChart({ periods }) {
  const data = periods.map((p) => ({
    key: `${p.year}-${p.month}`,
    label: monthLabel(p.month),
    fullLabel: `${monthLabel(p.month)} ${p.year}`,
    invested: p.invested,
    current: p.current,
  }));

  const labelByKey = Object.fromEntries(data.map((d) => [d.key, d.label]));
  const fullLabelByKey = Object.fromEntries(data.map((d) => [d.key, d.fullLabel]));

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);
  const showDots = data.length < 3;

  return (
    <ChartScrollContainer width={width} height={180}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
          <XAxis
            dataKey="key"
            tickFormatter={(key) => labelByKey[key] ?? key}
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
            axisLine={{ stroke: CHART_COLORS.line }}
            tickLine={false}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            content={<ChartTooltip formatter={fmt} labelFormatter={(key) => fullLabelByKey[key] ?? key} />}
            cursor={{ stroke: CHART_COLORS.teal, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="invested"
            name="Investido"
            stroke={CHART_COLORS.inkFaint}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={showDots ? { r: 3, fill: CHART_COLORS.inkFaint, strokeWidth: 0 } : false}
          />
          <Line
            type="monotone"
            dataKey="current"
            name="Valor atual"
            stroke={CHART_COLORS.teal}
            strokeWidth={2.5}
            dot={showDots ? { r: 3, fill: CHART_COLORS.teal, strokeWidth: 0 } : false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartScrollContainer>
  );
}
