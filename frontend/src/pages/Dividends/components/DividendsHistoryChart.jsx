import { fmt } from '../../../utils/format';
import { valuesHidden } from '../../../utils/privacy';
import { blurAfterPointer } from '../utils/dividends';
import ChartScrollContainer from '../../../components/charts/ChartScrollContainer';

const COL_WIDTH = 50;
const MIN_WIDTH = 100;
const BAR_AREA = 210;

// Rotulo curto em cima da barra; respeita o modo "ocultar valores".
function barLabel(value) {
  if (valuesHidden()) return '••••';
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace('.', ',')} mil`;
  return String(Math.round(value));
}

/**
 * Historico de dividendos recebidos: uma barra por periodo (mes ou ano),
 * dividida pelas cores dos bancos. `periods` vem pronto de quem chama:
 * [{ key, label, fullLabel, total, parts: [{ id, color, value }] }].
 */
export default function DividendsHistoryChart({ periods, currency, onBarClick }) {
  const max = Math.max(...periods.map((p) => p.total), 1);
  const width = Math.max(periods.length * COL_WIDTH, MIN_WIDTH);

  return (
    <ChartScrollContainer width={width} height={272}>
      <div className="dv-bars">
        {periods.map((p) => (
          <button
            type="button"
            key={p.key}
            className="dv-bar"
            title={`${p.fullLabel}: ${fmt(p.total, currency)}`}
            aria-label={`${p.fullLabel}: ${fmt(p.total, currency)}`}
            onClick={(e) => {
              blurAfterPointer(e);
              onBarClick(p.key);
            }}
          >
            <span className="dv-bar-total num">{barLabel(p.total)}</span>
            {p.parts.map((part, index) => (
              <span
                key={part.id}
                className={`dv-bar-part${index === 0 ? ' top' : ''}`}
                style={{ height: (part.value / max) * BAR_AREA, background: part.color }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="dv-bar-labels">
        {periods.map((p) => (
          <span key={p.key} className="num">
            {p.label}
          </span>
        ))}
      </div>
    </ChartScrollContainer>
  );
}
