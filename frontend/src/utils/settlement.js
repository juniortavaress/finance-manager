// Planejamento de acertos de contas entre amigos.
//
// Em Amigos o saldo total e a soma de varias ORIGENS isoladas (avulso + um
// saldo por grupo em comum) e cada acerto precisa ser gravado na origem certa
// - senao o saldo daquele grupo nunca zera. `direction` = -1 quando EU devo
// (marquei como pago) e +1 quando ELE me deve (registrar recebimento).

const toCents = (value) => Math.round((Number(value) || 0) * 100);

function originsFor(breakdown, direction) {
  return (breakdown || []).filter((b) => direction * b.amount > 0);
}

/** Total (em reais) das origens com saldo na direcao pedida. */
export function totalOfOrigins(breakdown, direction) {
  return originsFor(breakdown, direction).reduce((sum, b) => sum + toCents(Math.abs(b.amount)), 0) / 100;
}

/**
 * Distribui `amount` pelas origens com saldo na direcao pedida, em ordem
 * (avulso primeiro), limitando cada uma ao seu saldo. Retorna
 * [{ group_id|undefined, amount }]. Lanca Error se `amount` passa do total devido.
 * Sem breakdown (ex: dentro de um grupo) devolve um unico item sem origem
 * explicita - quem chama usa o escopo que ja tem (grupo ou amigo).
 */
export function planAllocations(breakdown, direction, amount) {
  const origins = originsFor(breakdown, direction);
  if (origins.length === 0) return [{ group_id: undefined, amount }];

  let remaining = toCents(amount);
  const totalCents = origins.reduce((sum, b) => sum + toCents(Math.abs(b.amount)), 0);
  if (remaining > totalCents) {
    throw new Error('O valor informado é maior que o saldo em aberto com essa pessoa.');
  }

  const plan = [];
  for (const origin of origins) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toCents(Math.abs(origin.amount)));
    plan.push({ group_id: origin.group_id || undefined, amount: take / 100 });
    remaining -= take;
  }
  return plan;
}
