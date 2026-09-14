export function expenseCategories(categories) {
  return categories.filter((c) => c.kind === 'expense' || c.kind === 'both');
}

export function incomeCategories(categories) {
  return categories.filter((c) => c.kind === 'income' || c.kind === 'both');
}
