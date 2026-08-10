export default function PeriodGranularitySelect({ value, onChange }) {
  return (
    <select className="granularity-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="monthly">Mensal</option>
      <option value="yearly">Anual</option>
    </select>
  );
}
