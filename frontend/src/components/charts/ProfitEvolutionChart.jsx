import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;
const GRADIENT_ID = 'profitLineGradient';

export default function ProfitEvolutionChart({ periods }) {
  const data = periods.map((p) => ({
    key: `${p.year}-${p.month}`,
    label: monthLabel(p.month),
    fullLabel: `${monthLabel(p.month)} ${p.year}`,
    profit: p.profit,
  }));

  const labelByKey = Object.fromEntries(data.map((d) => [d.key, d.label]));
  const fullLabelByKey = Object.fromEntries(data.map((d) => [d.key, d.fullLabel]));

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);
  const showDots = data.length < 3;

  const values = data.map((d) => d.profit);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const span = maxVal - minVal || 1;
  // Posicao (0=topo, 1=base) do valor 0 dentro do dominio do eixo Y, para o
  // gradiente trocar de cor exatamente na linha do zero, independente de
  // quanto do grafico fica acima/abaixo dela. Clamp pro caso de tudo
  // positivo/negativo (zero cai fora do dominio visivel do eixo).
  const zeroOffset = Math.min(1, Math.max(0, maxVal / span));

  return (
    <ChartScrollContainer width={width} height={180}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={CHART_COLORS.teal} />
              <stop offset={zeroOffset} stopColor={CHART_COLORS.teal} />
              <stop offset={zeroOffset} stopColor={CHART_COLORS.brick} />
              <stop offset={1} stopColor={CHART_COLORS.brick} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
          <XAxis
            dataKey="key"
            tickFormatter={(key) => labelByKey[key] ?? key}
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
            axisLine={{ stroke: CHART_COLORS.line }}
            tickLine={false}
          />
          <YAxis hide domain={[minVal, maxVal]} />
          <Tooltip
            content={<ChartTooltip formatter={fmt} labelFormatter={(key) => fullLabelByKey[key] ?? key} />}
            cursor={{ stroke: CHART_COLORS.inkFaint, strokeWidth: 1 }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.line} strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="profit"
            name="Lucro"
            stroke={`url(#${GRADIENT_ID})`}
            strokeWidth={2.5}
            dot={showDots ? { r: 3, fill: CHART_COLORS.inkFaint, strokeWidth: 0 } : false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartScrollContainer>
  );
}
