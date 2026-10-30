// Indexadores pos-fixados que o backend calcula sozinho (CDI/Selic via Banco
// Central) - ver INDEXER_SGS_CODES em economic_index_service.py.
const AUTO_INDEXERS = ['CDI', 'SELIC'];

// Pre-fixado e pos-fixado CDI/Selic sao lancados so' por valor (aporte e
// resgate), sem quantidade nem preco unitario - mesma regra de _is_value_based
// em investments.py. Aceita um ativo ja salvo ou o rascunho de um novo.
export function isValueBasedFixedIncome(asset) {
  if (!asset || asset.type !== 'renda_fixa') return false;
  if (asset.fixed_income_type === 'pre_fixado') return !!asset.maturity_date;
  if (asset.fixed_income_type === 'pos_fixado') {
    return AUTO_INDEXERS.includes((asset.fixed_income_indexer || '').trim().toUpperCase());
  }
  return false;
}

// "120% CDI" / "14,5% a.a." - taxa contratada num aporte.
export function fixedIncomeRateLabel(asset, ratePct) {
  if (ratePct == null) return '';
  const rate = String(ratePct).replace('.', ',');
  if (asset?.fixed_income_type === 'pos_fixado') return `${rate}% ${asset.fixed_income_indexer || ''}`.trim();
  return `${rate}% a.a.`;
}
