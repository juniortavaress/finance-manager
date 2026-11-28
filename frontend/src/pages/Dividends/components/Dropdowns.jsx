import { useMemo, useState } from 'react';
import { assetLabel } from '../utils/dividends';
import { ChevronDown } from './icons';

// Com a lista aberta, o ESC fecha so' a lista: sem o stopPropagation o evento
// chegaria ao ModalShell e fecharia o modal inteiro junto.
function closeOnEscape(open, close) {
  return (e) => {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
}

/** Lista suspensa com a identidade visual do app (substitui o <select> nativo). */
export function Select({ label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={`dv-field ${className}`} onKeyDown={closeOnEscape(open, () => setOpen(false))}>
      <span>{label}</span>
      {open && <button type="button" className="dv-backdrop" tabIndex={-1} aria-label="Fechar lista" onClick={() => setOpen(false)} />}
      <button
        type="button"
        className={`dv-control${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label || ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selected?.label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="dv-options">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              className={`dv-option${o.value === value ? ' selected' : ''}`}
              aria-pressed={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              <span className="check" aria-hidden="true">
                {o.value === value ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Busca de ativo com a corretora ao lado de cada nome. */
export function AssetSearch({ assets, value, onChange, bankOf }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = assets.find((a) => a.id === value);
  const selectedBank = selected ? bankOf(selected) : null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((a) => !q || `${a.code || ''} ${a.name || ''} ${bankOf(a)?.name || ''}`.toLowerCase().includes(q))
      .sort((a, b) => assetLabel(a).localeCompare(assetLabel(b), 'pt-BR'));
  }, [assets, query, bankOf]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="dv-field" onKeyDown={closeOnEscape(open, close)}>
      <span>Ativo</span>
      {open && <button type="button" className="dv-backdrop" tabIndex={-1} aria-label="Fechar lista de ativos" onClick={close} />}
      <div className="dv-control search">
        <span className="dv-swatch" style={{ background: selectedBank?.color_hex || 'var(--line)' }} />
        <input
          type="text"
          aria-label="Buscar ativo"
          placeholder={selected ? assetLabel(selected) : 'Buscar ativo...'}
          autoComplete="off"
          value={open ? query : assetLabel(selected)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        />
        <span className="dv-hint">{selectedBank?.name}</span>
      </div>
      {open && (
        <div className="dv-options">
          {matches.map((a) => {
            const bank = bankOf(a);
            return (
              <button
                type="button"
                key={a.id}
                className={`dv-option${a.id === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(a.id);
                  close();
                }}
              >
                <span className="dv-swatch" style={{ background: bank?.color_hex }} />
                <span>{assetLabel(a)}</span>
                <span className="dv-hint">{bank?.name}</span>
              </button>
            );
          })}
          {matches.length === 0 && <span className="dv-option-empty">Nenhum ativo encontrado.</span>}
        </div>
      )}
    </div>
  );
}
