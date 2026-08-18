import { IconChevronDown } from './icons';

export default function LoadMoreButton({ shown, total, onClick, loading }) {
  if (!total || shown >= total) return null;

  return (
    <div className="load-more-row">
      <button type="button" className="load-more-btn" onClick={onClick} disabled={loading}>
        {loading ? 'Carregando...' : `ver mais (${shown} de ${total})`}
        <IconChevronDown style={{ width: 11, height: 11 }} />
      </button>
    </div>
  );
}
