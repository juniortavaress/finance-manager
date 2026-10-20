import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Corretora (select) + Ativo (caixa de busca que abre a lista ao clicar e vai
 * filtrando enquanto digita), no mesmo estilo do modal "Nova compra".
 *
 * O dropdown vai num portal posicionado via getBoundingClientRect para poder
 * "vazar" para fora do modal (overflow:hidden) sem ser cortado.
 */
export default function BrokerAssetPicker({
  assets = [],
  investmentAccounts = [],
  bankById,
  assetId,
  onAssetChange,
  disabled = false,
}) {
  const [investmentAccountId, setInvestmentAccountId] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const searchWrapRef = useRef(null);
  const inputRef = useRef(null);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === assetId), [assets, assetId]);

  // Mantém a corretora coerente com o ativo selecionado (edição) e, sem ativo,
  // cai na primeira corretora disponível.
  useEffect(() => {
    if (selectedAsset) {
      setInvestmentAccountId(selectedAsset.investment_account_id);
    } else if (!investmentAccountId) {
      setInvestmentAccountId(investmentAccounts[0]?.investment_account?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, investmentAccounts]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target) &&
        !e.target.closest('[data-pick-asset-dropdown]')
      ) {
        setSearchOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!searchOpen) return;
    function updateRect() {
      if (!inputRef.current) return;
      setDropdownRect(inputRef.current.getBoundingClientRect());
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
    () => assets.filter((a) => a.investment_account_id === investmentAccountId),
    [assets, investmentAccountId]
  );

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assetsInAccount;
    return assetsInAccount.filter(
      (a) => (a.code || '').toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q)
    );
  }, [assetsInAccount, query]);

  function handleAccountChange(e) {
    setInvestmentAccountId(e.target.value);
    setQuery('');
    setSearchOpen(false);
    onAssetChange('');
  }

  function handlePick(asset) {
    setSearchOpen(false);
    setQuery('');
    onAssetChange(asset.id);
  }

  const selectedLabel = selectedAsset ? selectedAsset.code || selectedAsset.name : '';

  return (
    <>
      <div className="field">
        <label>Corretora</label>
        <select value={investmentAccountId} onChange={handleAccountChange} disabled={disabled}>
          {investmentAccounts.map((a) => (
            <option key={a.investment_account?.id} value={a.investment_account?.id}>
              {bankNameFor(a)}
            </option>
          ))}
        </select>
      </div>

      <div className="field" ref={searchWrapRef}>
        <label>Ativo</label>
        <input
          ref={inputRef}
          type="text"
          placeholder={selectedLabel || 'Buscar ativo...'}
          value={searchOpen ? query : selectedLabel}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchOpen(true)}
          autoComplete="off"
          disabled={disabled}
        />
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

            {filteredAssets.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                {query.trim() ? 'Nenhum ativo encontrado.' : 'Nenhum ativo cadastrado nesta corretora.'}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
