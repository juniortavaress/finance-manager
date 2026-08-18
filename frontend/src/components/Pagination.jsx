export default function Pagination({ page, pageSize, total, onPageChange }) {
  if (!total || total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, fontSize: 12.5 }}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="btn btn-ghost"
        style={{ padding: '6px 12px', fontSize: 12.5, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}
      >
        ‹ anterior
      </button>
      <span style={{ color: 'var(--ink-faint)' }}>
        {start}–{end} de {total}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="btn btn-ghost"
        style={{ padding: '6px 12px', fontSize: 12.5, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'default' : 'pointer' }}
      >
        próxima ›
      </button>
    </div>
  );
}
