export function checkingAccounts(accounts) {
  return accounts.filter((a) => a.type === 'checking');
}

export function creditCardAccounts(accounts) {
  return accounts.filter((a) => a.type === 'credit_card');
}

export function investmentAccounts(accounts) {
  return accounts.filter((a) => !!a.investment_account);
}
