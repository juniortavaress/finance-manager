const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function CloseButton({ onClick }) {
  return (
    <button type="button" className="dv-icon-btn close" onClick={onClick} aria-label="Fechar">
      <svg {...stroke}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

export function DeleteButton({ onClick }) {
  return (
    <button type="button" className="dv-icon-btn danger" onClick={onClick} aria-label="Excluir" title="Excluir">
      <svg {...stroke}>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
      </svg>
    </button>
  );
}

export function ChevronDown() {
  return (
    <svg {...stroke}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg {...stroke} strokeWidth={1.8} width="11" height="11">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
