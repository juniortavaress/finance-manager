import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from './ModalShell';

/**
 * Passo 1 de "nova compra/venda": primeiro escolhe a corretora, depois busca o
 * ativo dentro dela (ou cadastra um novo, só disponível para compra). Depois
 * de escolhido, quem abriu este modal segue pro TradeAssetModal com o ativo definido.
 *
 * O dropdown de resultados é renderizado num portal (fora da árvore do modal)
 * e posicionado via getBoundingClientRect, pra poder "vazar" visualmente para
 * fora do modal (que tem overflow:hidden por causa do border-radius) em vez de
 * ser cortado nas bordas dele.
 */
export default function PickAssetModal({
  open,
  onClose,
  onPick,
  onNewAsset,
  assets = [],
  investmentAccounts = [],
  bankById,
  kind = 'buy',
  initialInvestmentAccountId = '',
}) {
  const isSell = kind === 'sell';
  const pickableAssets = isSell ? assets.filter((a) => (a.position?.quantity || 0) > 0) : assets;
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const searchWrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setInvestmentAccountId(initialInvestmentAccountId || investmentAccounts[0]?.investment_account?.id || '');
    setQuery('');
    setSearchOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setQuery('');
    setSearchOpen(false);
  }, [investmentAccountId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target) &&
        !e.target.closest('[data-pick-asset-dropdown]')
      ) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!searchOpen) return;
    function updateRect() {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect(rect);
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [searchOpen]);

  function bankNameFor(account) {
    const bank = bankById ? bankById(account.bank_id) : null;
    return bank?.name || account.name;
  }

  const assetsInAccount = useMemo(
    () => pickableAssets.filter((a) => a.investment_account_id === investmentAccountId),
    [pickableAssets, investmentAccountId]
  );

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assetsInAccount;
    return assetsInAccount.filter((a) => (a.code || '').toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q));
  }, [assetsInAccount, query]);

  if (!open) return null;

  const hasTyped = query.trim().length > 0;
  const showAddAsset = !isSell && hasTyped && filteredAssets.length === 0;

  function handlePick(asset) {
    setSearchOpen(false);
    onPick(asset, investmentAccountId);
  }

  function handleNewAsset() {
    setSearchOpen(false);
    onNewAsset(investmentAccountId, query.trim());
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isSell ? 'Nova venda' : 'Nova compra'}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Corretora</label>
            <select value={investmentAccountId} onChange={(e) => setInvestmentAccountId(e.target.value)}>
              {investmentAccounts.map((a) => (
                <option key={a.investment_account?.id} value={a.investment_account?.id}>
                  {bankNameFor(a)}
                </option>
              ))}
            </select>
          </div>

          {investmentAccountId && (
            <div className="field" ref={searchWrapRef}>
              <label>Ativo</label>
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar ou cadastrar ativo..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                autoComplete="off"
              />
            </div>
          )}

          {!investmentAccountId && (
            <div className="empty-hint" style={{ marginBottom: 16 }}>
              Você ainda não tem nenhuma corretora cadastrada.
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
          </div>
        </div>
      </div>

      {searchOpen &&
        dropdownRect &&
        createPortal(
          <div
            data-pick-asset-dropdown
            className="pick-asset-dropdown"
            style={{
              position: 'fixed',
              top: dropdownRect.bottom + 4,
              left: dropdownRect.left,
              width: dropdownRect.width,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              boxShadow: '0 8px 20px rgba(28, 43, 41, 0.2)',
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 1000,
            }}
          >
            {filteredAssets.map((a) => (
              <div
                key={a.id}
                onClick={() => handlePick(a)}
                style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13.5 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {a.code || a.name}
              </div>
            ))}

            {filteredAssets.length === 0 && !showAddAsset && (
              <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                {isSell ? 'Nenhum ativo com posição disponível nesta corretora.' : 'Nenhum ativo cadastrado nesta corretora.'}
              </div>
            )}

            {showAddAsset && (
              <div
                onClick={handleNewAsset}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--teal)',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--teal-soft)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cadastrar “{query.trim()}” como novo ativo
              </div>
            )}
          </div>,
          document.body
        )}
    </ModalShell>
  );
}
