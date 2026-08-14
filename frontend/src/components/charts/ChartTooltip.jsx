export default function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const displayLabel = labelFormatter ? labelFormatter(label, payload) : label;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{displayLabel}</div>
      {payload.map((entry) => (
        <div className="chart-tooltip-row" key={entry.dataKey}>
          <span className="chart-tooltip-dot" style={{ background: entry.color }} />
          <span className="chart-tooltip-name">{entry.name}</span>
          <span className="chart-tooltip-val num">{formatter ? formatter(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}
