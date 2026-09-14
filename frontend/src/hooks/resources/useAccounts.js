import { useFetch } from '../useFetch';
import { accountsApi } from '../../api/resources';

export function useAccounts() {
  const { data, loading, initialLoading, error, reload } = useFetch(
    (signal) => accountsApi.list(undefined, signal),
    []
  );
  return { accounts: data?.accounts || [], loading, initialLoading, error, reload };
}
