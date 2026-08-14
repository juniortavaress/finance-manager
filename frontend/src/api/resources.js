import { api } from './client';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const banksApi = {
  list: () => api.get('/banks/'),
  create: (data) => api.post('/banks/', data),
  update: (id, data) => api.patch(`/banks/${id}`, data),
  archive: (id) => api.delete(`/banks/${id}`),
  usage: (id) => api.get(`/banks/${id}/usage`),
};

export const accountsApi = {
  list: (params) => api.get('/accounts/', params),
  create: (data) => api.post('/accounts/', data),
  update: (id, data) => api.patch(`/accounts/${id}`, data),
  archive: (id) => api.delete(`/accounts/${id}`),
  usage: (id) => api.get(`/accounts/${id}/usage`),
};

export const categoriesApi = {
  list: (params) => api.get('/categories/', params),
  create: (data) => api.post('/categories/', data),
  update: (id, data) => api.patch(`/categories/${id}`, data),
  archive: (id, body) => api.delete(`/categories/${id}`, body),
  usage: (id) => api.get(`/categories/${id}/usage`),
};

export const transactionsApi = {
  list: (params) => api.get('/transactions/', params),
  create: (data) => api.post('/transactions/', data),
  update: (id, data) => api.patch(`/transactions/${id}`, data),
  remove: (id) => api.delete(`/transactions/${id}`),
};

export const recurringApi = {
  list: (params) => api.get('/recurring/', params),
  create: (data) => api.post('/recurring/', data),
  update: (id, data) => api.patch(`/recurring/${id}`, data),
  remove: (id) => api.delete(`/recurring/${id}`),
  markPaid: (id) => api.post(`/recurring/${id}/mark-paid`),
};

export const installmentsApi = {
  list: (params) => api.get('/installments/', params),
  get: (id) => api.get(`/installments/${id}`),
  advance: (id, data) => api.post(`/installments/${id}/advance`, data),
  cancelFrom: (id, installmentNumber) => api.delete(`/installments/${id}/from/${installmentNumber}`),
};

export const creditCardsApi = {
  invoices: (cardId, limit) => api.get(`/credit-cards/${cardId}/invoices`, { limit }),
  payInvoice: (cardId, invoiceId, data) => api.post(`/credit-cards/${cardId}/invoices/${invoiceId}/pay`, data),
};

export const investmentsApi = {
  list: () => api.get('/investments/'),
  create: (data) => api.post('/investments/', data),
  update: (id, data) => api.patch(`/investments/${id}`, data),
};

export const dashboardApi = {
  summary: (year, month) => api.get('/dashboard/summary', { year, month }),
  spendingByCategory: (year, month) => api.get('/dashboard/spending-by-category', { year, month }),
  balanceByBank: () => api.get('/dashboard/balance-by-bank'),
  incomeVsExpense: (granularity = 'monthly') => api.get('/dashboard/income-vs-expense', { granularity }),
  balanceEvolution: (granularity = 'monthly') => api.get('/dashboard/balance-evolution', { granularity }),
  upcomingInvoices: () => api.get('/dashboard/upcoming-invoices'),
  recentTransactions: (limit) => api.get('/dashboard/recent-transactions', { limit }),
  periodInvoices: () => api.get('/dashboard/period-invoices'),
};

export const reportsApi = {
  monthlyComparison: (months) => api.get('/reports/monthly-comparison', { months }),
};

export const friendsApi = {
  search: (q) => api.get('/friends/search', { q }),
  list: () => api.get('/friends/'),
  requests: () => api.get('/friends/requests'),
  sendRequest: (addresseeId) => api.post('/friends/requests', { addressee_id: addresseeId }),
  acceptRequest: (id) => api.post(`/friends/requests/${id}/accept`),
  rejectRequest: (id) => api.post(`/friends/requests/${id}/reject`),
  expenses: (friendUserId) => api.get(`/friends/${friendUserId}/expenses`),
  history: (friendUserId) => api.get(`/friends/${friendUserId}/history`),
  balance: (friendUserId) => api.get(`/friends/${friendUserId}/balance`),
  accounts: (friendUserId) => api.get(`/friends/${friendUserId}/accounts`),
  activity: (limit) => api.get('/friends/activity', { limit }),
};

export const groupsApi = {
  list: () => api.get('/groups/'),
  create: (data) => api.post('/groups/', data),
  get: (id) => api.get(`/groups/${id}`),
  update: (id, data) => api.patch(`/groups/${id}`, data),
  addMember: (id, userId) => api.post(`/groups/${id}/members`, { user_id: userId }),
  removeMember: (id, userId) => api.delete(`/groups/${id}/members/${userId}`),
  remove: (id) => api.delete(`/groups/${id}`),
  simplify: (id) => api.get(`/groups/${id}/simplify`),
};

export const sharedExpensesApi = {
  create: (data) => api.post('/shared-expenses/', data),
  update: (id, data) => api.patch(`/shared-expenses/${id}`, data),
  remove: (id) => api.delete(`/shared-expenses/${id}`),
  linkPayment: (id, accountId) => api.post(`/shared-expenses/${id}/link-payment`, { account_id: accountId }),
  pendingPayments: () => api.get('/shared-expenses/pending-payments'),
};

export const settlementsApi = {
  list: (params) => api.get('/settlements/', params),
  create: (data) => api.post('/settlements/', data),
  receive: (data) => api.post('/settlements/receive', data),
  recordReceipt: (id, accountId) => api.post(`/settlements/${id}/record-receipt`, { account_id: accountId }),
  pendingReceipts: () => api.get('/settlements/pending-receipts'),
  remove: (id) => api.delete(`/settlements/${id}`),
};
