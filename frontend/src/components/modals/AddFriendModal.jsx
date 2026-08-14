import { useEffect, useState } from 'react';
import { friendsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import { IconSearch } from '../icons';
import ModalShell from './ModalShell';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function AddFriendModal({ open, onClose, onSent }) {
  const { showError } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSentIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      friendsApi
        .search(query.trim())
        .then((data) => {
          if (!cancelled) setResults(data.users);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  async function handleSend(userId) {
    try {
      await friendsApi.sendRequest(userId);
      setSentIds((prev) => new Set(prev).add(userId));
      onSent?.();
    } catch (err) {
      showError(err.message || 'Não foi possível enviar a solicitação.');
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Adicionar amigo</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Buscar por nome ou e-mail</label>
            <div className="filter-search">
              <IconSearch />
              <input
                type="text"
                placeholder="Digite ao menos 2 letras..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="friend-search-results">
            {searching && <div className="friend-search-hint">Buscando...</div>}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="friend-search-hint">Nenhum usuário encontrado.</div>
            )}
            {results.map((u) => (
              <div className="friend-row" key={u.id}>
                <div className="friend-left">
                  <div className="friend-avatar">{initials(u.name)}</div>
                  <div>
                    <div className="friend-name">{u.name}</div>
                    <div className="friend-sub">{u.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={sentIds.has(u.id)}
                  onClick={() => handleSend(u.id)}
                >
                  {sentIds.has(u.id) ? 'Solicitação enviada' : 'Adicionar'}
                </button>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Fechar
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
