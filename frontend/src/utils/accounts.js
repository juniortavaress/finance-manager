export function sortBanks(banks, accounts) {
  const typeCount = (bankId) => accounts.filter((a) => a.bank_id === bankId).length;
  return [...banks].sort((a, b) => typeCount(a.id) - typeCount(b.id) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function checkingAccounts(accounts) {
  return accounts.filter((a) => a.type === 'checking');
}

export function creditCardAccounts(accounts) {
  return accounts.filter((a) => a.type === 'credit_card');
}

export function investmentAccounts(accounts) {
  return accounts.filter((a) => !!a.investment_account);
}
