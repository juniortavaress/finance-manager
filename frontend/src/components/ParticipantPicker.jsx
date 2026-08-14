function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/**
 * Seletor de participantes por chips clicaveis: clicar num candidato disponivel
 * move ele para a lista de selecionados; clicar num selecionado remove.
 * Sem <select multiple> -- feedback visual imediato de quem esta dentro/fora.
 */
export default function ParticipantPicker({ candidates, selectedIds, onChange }) {
  const selectedSet = new Set(selectedIds.map(String));
  const available = candidates.filter((c) => !selectedSet.has(String(c.id)));
  const selected = candidates.filter((c) => selectedSet.has(String(c.id)));

  function toggleAdd(id) {
    onChange([...selectedIds, id]);
  }

  function toggleRemove(id) {
    onChange(selectedIds.filter((x) => String(x) !== String(id)));
  }

  return (
    <div className="participant-picker">
      <div className="participant-picker-section">
        <div className="participant-picker-label">Selecionados</div>
        <div className="chip-row">
          {selected.length === 0 && <span className="chip-empty">Ninguém selecionado ainda</span>}
          {selected.map((c) => (
            <button type="button" key={c.id} className="chip chip-selected" onClick={() => toggleRemove(c.id)}>
              <span className="chip-avatar">{initials(c.name)}</span>
              {c.name}
              <span className="chip-remove">✕</span>
            </button>
          ))}
        </div>
      </div>

      {available.length > 0 && (
        <div className="participant-picker-section">
          <div className="participant-picker-label">Disponíveis</div>
          <div className="chip-row">
            {available.map((c) => (
              <button type="button" key={c.id} className="chip" onClick={() => toggleAdd(c.id)}>
                <span className="chip-avatar">{initials(c.name)}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
