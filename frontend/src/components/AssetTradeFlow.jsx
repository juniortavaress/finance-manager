import { useEffect, useMemo, useState } from 'react';
import { investmentsApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { useBanks } from '../hooks/resources/useBanks';
import { useAccounts } from '../hooks/resources/useAccounts';
import { investmentAccounts as filterInvestment } from '../utils/accounts';
import PickAssetModal from './modals/PickAssetModal';
import NewAssetModal from './modals/NewAssetModal';
import TradeAssetModal from './modals/TradeAssetModal';

/**
 * Fluxo completo de compra/venda: escolher (ou criar) o ativo e registrar a operacao.
 * `kind` ('buy' | 'sell') abre o fluxo; `null` o mantem fechado.
 */
export default function AssetTradeFlow({ kind, initialInvestmentAccountId = '', onClose, onSaved }) {
  const { banks } = useBanks();
  const { accounts } = useAccounts();
  const investmentAccounts = useMemo(() => filterInvestment(accounts), [accounts]);
  const { data } = useFetch((signal) => investmentsApi.listAssetsLight(signal), [], { cacheKey: 'assets.light' });
  const assets = data?.assets || [];

  const [stage, setStage] = useState(null);
  const [lastInvestmentAccountId, setLastInvestmentAccountId] = useState('');
  const [newAssetPreset, setNewAssetPreset] = useState({ investmentAccountId: '', name: '' });
  const [tradeState, setTradeState] = useState(null);

  useEffect(() => {
    setStage(kind ? 'pick' : null);
    setTradeState(null);
    if (kind) setLastInvestmentAccountId(initialInvestmentAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const bankById = (id) => banks.find((b) => b.id === id);
  const accountFor = (asset) => investmentAccounts.find((a) => a.investment_account?.id === asset.investment_account_id);
  const tradedAsset = tradeState?.asset || tradeState?.assetDraft;

  function handleBack() {
    if (tradeState.assetDraft) {
      setNewAssetPreset({
        investmentAccountId: tradeState.assetDraft.investment_account_id,
        name: tradeState.assetDraft.name,
      });
      setStage('new');
    } else {
      setStage('pick');
    }
    setTradeState(null);
  }

  return (
    <>
      <PickAssetModal
        open={stage === 'pick'}
        kind={kind || 'buy'}
        assets={assets}
        investmentAccounts={investmentAccounts}
        bankById={bankById}
        initialInvestmentAccountId={lastInvestmentAccountId}
        onClose={onClose}
        onPick={(asset, investmentAccountId) => {
          setLastInvestmentAccountId(investmentAccountId);
          setTradeState({ asset });
          setStage('trade');
        }}
        onNewAsset={(investmentAccountId, name) => {
          setLastInvestmentAccountId(investmentAccountId);
          setNewAssetPreset({ investmentAccountId, name });
          setStage('new');
        }}
      />

      <NewAssetModal
        open={stage === 'new'}
        deferCreate
        banks={banks}
        investmentAccounts={investmentAccounts}
        presetInvestmentAccountId={newAssetPreset.investmentAccountId}
        presetName={newAssetPreset.name}
        onClose={onClose}
        onDraftReady={(draft) => {
          setTradeState({ assetDraft: draft });
          setStage('trade');
        }}
      />

      <TradeAssetModal
        open={stage === 'trade' && !!tradedAsset}
        asset={tradeState?.asset}
        assetDraft={tradeState?.assetDraft}
        kind={tradeState?.assetDraft ? 'buy' : kind}
        accountBalance={tradedAsset ? accountFor(tradedAsset)?.balance ?? null : null}
        accountCurrency={tradedAsset ? accountFor(tradedAsset)?.currency || 'BRL' : undefined}
        onClose={onClose}
        onBack={handleBack}
        onSaved={() => {
          onClose();
          onSaved?.();
        }}
      />
    </>
  );
}
