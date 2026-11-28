/**
 * Recorta o resumo "todas as corretoras" (GET /investments/summary) para uma
 * corretora específica sem nova chamada ao backend, replicando o que a rota
 * faz com `bank_id`: valores de moeda estrangeira voltam para a moeda original
 * da corretora (o "todas" os converte para BRL e guarda o original em
 * `*_original`) e os totais são recalculados só com os itens dela.
 */
export function deriveBankSummary(summary, bankId) {
  if (!summary || !bankId) return summary;

  const assets = (summary.assets || [])
    .filter((a) => a.bank_id === bankId)
    .map((a) => {
      if (a.currency === 'BRL') return a;
      const {
        invested_amount_original: investedOriginal,
        current_amount_original: currentOriginal,
        dividends_total_original: dividendsOriginal,
        ...position
      } = a.position;
      return {
        ...a,
        position: {
          ...position,
          invested_amount: investedOriginal ?? position.invested_amount,
          current_amount: currentOriginal,
          dividends_total: dividendsOriginal ?? position.dividends_total,
        },
      };
    });

  const unallocatedByBank = (summary.unallocated_by_bank || [])
    .filter((b) => b.bank_id === bankId)
    .map((b) => ({ ...b, balance: b.balance_original ?? b.balance }));

  const investedByBank = (summary.invested_by_bank || [])
    .filter((b) => b.bank_id === bankId)
    .map((b) => ({ ...b, value: b.value_original ?? b.value }));

  const sum = (list, pick) => list.reduce((s, item) => s + pick(item), 0);
  const activeAssets = assets.filter((a) => a.position.quantity > 0);
  const allocatedCost = sum(activeAssets, (a) => a.position.invested_amount);
  const totalCurrent = sum(activeAssets, (a) =>
    a.position.current_amount != null ? a.position.current_amount : a.position.invested_amount
  );
  const totalDividends = sum(activeAssets, (a) => a.position.dividends_total);
  const totalInvested = sum(investedByBank, (b) => b.value);

  return {
    ...summary,
    assets,
    unallocated_by_bank: unallocatedByBank,
    invested_by_bank: investedByBank,
    total_transferred: totalInvested,
    total_invested: totalInvested,
    total_allocated_cost: allocatedCost,
    total_unallocated: sum(unallocatedByBank, (b) => b.balance),
    rentability_total:
      allocatedCost > 0 ? ((totalCurrent + totalDividends - allocatedCost) / allocatedCost) * 100 : null,
    fx_rates: null,
    fx_updated_at: null,
  };
}
