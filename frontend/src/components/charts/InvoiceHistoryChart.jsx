import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt, monthLabel } from '../../utils/format';
import ChartScrollContainer from './ChartScrollContainer';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from './theme';

const COL_WIDTH = 56;
const MIN_WIDTH = 100;

export default function InvoiceHistoryChart({ monthGroups, creditCardAccounts, colorForAccount, highlightedCardId, onToggleHighlight }) {
  const data = monthGroups.map((group) => {
    const row = { key: group.referenceMonth, label: monthLabel(Number(group.referenceMonth.slice(5, 7))) };
    group.bars.forEach(({ account, amount }) => {
      row[account.credit_card.id] = amount;
    });
    return row;
  });

  const width = Math.max(data.length * COL_WIDTH, MIN_WIDTH);

  return (
    <ChartScrollContainer width={width} height={180}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.line} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10.5, fill: CHART_COLORS.inkFaint }}
            axisLine={{ stroke: CHART_COLORS.line }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<ChartTooltip formatter={fmt} />} cursor={{ fill: CHART_COLORS.bg }} />
          {creditCardAccounts.map((account) => {
            const cardId = account.credit_card.id;
            const dimmed = highlightedCardId && highlightedCardId !== cardId;
            return (
              <Bar
                key={cardId}
                dataKey={cardId}
                name={account.name}
                fill={colorForAccount(account)}
                radius={[2, 2, 0, 0]}
                barSize={12}
                opacity={dimmed ? 0.3 : 1}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                onClick={() => onToggleHighlight(cardId)}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartScrollContainer>
  );
}
