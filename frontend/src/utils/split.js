// Espelho client-side do split_service.py, usado so para o preview ao vivo no
// modal -- o backend sempre recalcula e valida por conta propria no submit.
export function splitEqualPreview(totalAmount, participantIds) {
  const n = participantIds.length;
  if (n === 0 || !totalAmount) return {};
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const ordered = [...participantIds].sort((a, b) => String(a).localeCompare(String(b)));
  const shares = {};
  ordered.forEach((id, i) => {
    shares[id] = (base + (i < remainder ? 1 : 0)) / 100;
  });
  return shares;
}
