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
  incomeVsExpense: (months) => api.get('/dashboard/income-vs-expense', { months }),
  balanceEvolution: (months) => api.get('/dashboard/balance-evolution', { months }),
  upcomingInvoices: () => api.get('/dashboard/upcoming-invoices'),
  recentTransactions: (limit) => api.get('/dashboard/recent-transactions', { limit }),
};

export const reportsApi = {
  monthlyComparison: (months) => api.get('/reports/monthly-comparison', { months }),
};

export const remindersApi = {
  list: () => api.get('/reminders/'),
  create: (data) => api.post('/reminders/', data),
  update: (id, data) => api.patch(`/reminders/${id}`, data),
  remove: (id) => api.delete(`/reminders/${id}`),
  markPaid: (id) => api.post(`/reminders/${id}/mark-paid`),
};
