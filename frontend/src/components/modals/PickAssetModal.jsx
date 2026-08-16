import { useEffect, useState } from 'react';
import ModalShell from './ModalShell';

/**
 * Passo 1 de "nova compra": escolher em qual ativo a compra entra, ou ir
 * cadastrar um novo ativo primeiro (NewAssetModal). Depois de escolhido,
 * quem abriu este modal segue pro TradeAssetModal com o ativo definido.
 */
export default function PickAssetModal({ open, onClose, onPick, onNewAsset, assets = [], investmentAccounts = [], bankById }) {
  const [selectedAssetId, setSelectedAssetId] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedAssetId(assets[0]?.id || '');
  }, [open, assets]);

  if (!open) return null;

  function bankNameFor(asset) {
    const account = investmentAccounts.find((a) => a.investment_account?.id === asset.investment_account_id);
    const bank = account && bankById ? bankById(account.bank_id) : null;
    return bank?.name || '';
  }

  function handleContinue(e) {
    e.preventDefault();
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (asset) onPick(asset);
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Nova compra</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleContinue}>
          {assets.length === 0 ? (
            <div className="empty-hint" style={{ marginBottom: 16 }}>
              Você ainda não tem nenhum ativo cadastrado. Cadastre um para começar a registrar compras.
            </div>
          ) : (
            <div className="field">
              <label>Ativo</label>
              <select value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code || a.name} — {bankNameFor(a)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            style={{ fontSize: 12.5, color: 'var(--teal)', cursor: 'pointer', marginBottom: 4 }}
            onClick={onNewAsset}
          >
            + cadastrar novo ativo
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={assets.length === 0}>
              Continuar
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
