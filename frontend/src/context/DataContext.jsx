import { createContext, useCallback, useContext, useState } from 'react';
import { accountsApi, banksApi, categoriesApi, friendsApi } from '../api/resources';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [banks, setBanks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reloadAll = useCallback(async () => {
    const [banksRes, accountsRes, categoriesRes, friendsRes] = await Promise.all([
      banksApi.list(),
      accountsApi.list(),
      categoriesApi.list(),
      friendsApi.list(),
    ]);
    setBanks(banksRes.banks);
    setAccounts(accountsRes.accounts);
    setCategories(categoriesRes.categories);
    setFriends(friendsRes.friends);
    setLoaded(true);
  }, []);

  const value = {
    banks,
    accounts,
    categories,
    friends,
    loaded,
    reloadAll,
    friendById: (id) => friends.find((f) => f.id === id),
    checkingAccounts: accounts.filter((a) => a.type === 'checking'),
    creditCardAccounts: accounts.filter((a) => a.type === 'credit_card'),
    investmentAccounts: accounts.filter((a) => a.type === 'investment'),
    expenseCategories: categories.filter((c) => c.kind === 'expense' || c.kind === 'both'),
    incomeCategories: categories.filter((c) => c.kind === 'income' || c.kind === 'both'),
    bankById: (id) => banks.find((b) => b.id === id),
    categoryById: (id) => categories.find((c) => c.id === id),
    accountById: (id) => accounts.find((a) => a.id === id),
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider');
  return ctx;
}
