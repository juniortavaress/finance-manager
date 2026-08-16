import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;

export default function UpcomingDividendsChart({ periods }) {
  const data = periods.map((p) => ({
    key: `${p.year}-${p.month}`,
    label: monthLabel(p.month),
    fullLabel: `${monthLabel(p.month)} ${p.year}`,
    total: p.total,
  }));

  const labelByKey = Object.fromEntries(data.map((d) => [d.key, d.label]));
  const fullLabelByKey = Object.fromEntries(data.map((d) => [d.key, d.fullLabel]));

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);

  return (
    <ChartScrollContainer width={width} height={180}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
          <XAxis
            dataKey="key"
            tickFormatter={(key) => labelByKey[key] ?? key}
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
            axisLine={{ stroke: CHART_COLORS.line }}
            tickLine={false}
          />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            content={<ChartTooltip formatter={fmt} labelFormatter={(key) => fullLabelByKey[key] ?? key} />}
            cursor={{ fill: CHART_COLORS.bg }}
          />
          <Bar dataKey="total" name="Previsto" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d) => (
              <Cell key={d.key} fill={CHART_COLORS.gold} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartScrollContainer>
  );
}
