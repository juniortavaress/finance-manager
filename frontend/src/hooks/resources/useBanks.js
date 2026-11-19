import { useFetch } from '../useFetch';
import { banksApi } from '../../api/resources';

export function useBanks() {
  const { data, loading, initialLoading, error, reload } = useFetch((signal) => banksApi.list(signal), [], {
    cacheKey: 'banks',
  });
  return { banks: data?.banks || [], loading, initialLoading, error, reload };
}
