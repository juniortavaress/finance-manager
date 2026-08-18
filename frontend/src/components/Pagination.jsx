import { IconChevronDown } from './icons';

export default function Pagination({ page, pageSize, total, onPageChange }) {
  if (!total || total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        title="Página anterior"
      >
        <IconChevronDown style={{ transform: 'rotate(90deg)' }} />
      </button>
      <span className="pagination-info">
        {start}–{end} de {total}
      </span>
      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        title="Próxima página"
      >
        <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
      </button>
    </div>
  );
}
