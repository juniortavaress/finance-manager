// Dominio de cada banco conhecido; o logo vem do servico publico de favicons.
const BANK_DOMAINS = [
  ['nubank', 'nubank.com.br'],
  ['nu ', 'nubank.com.br'],
  ['itau', 'itau.com.br'],
  ['inter', 'bancointer.com.br'],
  ['c6', 'c6bank.com.br'],
  ['bradesco', 'bradesco.com.br'],
  ['santander', 'santander.com.br'],
  ['banco do brasil', 'bb.com.br'],
  ['bb', 'bb.com.br'],
  ['caixa', 'caixa.gov.br'],
  ['xp', 'xpi.com.br'],
  ['btg', 'btgpactual.com'],
  ['picpay', 'picpay.com'],
  ['mercado pago', 'mercadopago.com.br'],
  ['neon', 'neon.com.br'],
  ['original', 'original.com.br'],
  ['sicoob', 'sicoob.com.br'],
  ['sicredi', 'sicredi.com.br'],
  ['safra', 'safra.com.br'],
  ['pagbank', 'pagbank.com.br'],
  ['pagseguro', 'pagseguro.uol.com.br'],
  ['rico', 'rico.com.vc'],
  ['clear', 'clear.com.br'],
  ['modal', 'modal.com.br'],
  ['genial', 'genialinvestimentos.com.br'],
  ['nomad', 'nomadglobal.com'],
  ['wise', 'wise.com'],
  ['revolut', 'revolut.com'],
];

function normalize(name) {
  return `${name || ''} `
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// O favicon do XP e um retangulo escuro (72x64 de 96) com o "xp" vazado, centralizado
// e cercado de transparencia. Ampliar corta a margem; o fundo branco aparece pelo "xp" vazado.
export function bankLogoOverride(bank) {
  return /(^|\s)xp(\s|$)/.test(normalize(bank?.name)) ? { scale: 'scale(1.4, 1.5)' } : null;
}

export function bankLogoUrl(bank) {
  if (bank?.logo_url) return bank.logo_url;
  const name = normalize(bank?.name);
  const match = BANK_DOMAINS.find(([key]) => {
    // Chaves curtas ("bb", "xp", "c6") so valem como palavra inteira.
    if (key.trim().length <= 3) return new RegExp(`(^|\\s)${key.trim()}(\\s|$)`).test(name);
    return name.includes(key);
  });
  return match ? `https://www.google.com/s2/favicons?domain=${match[1]}&sz=128` : null;
}
