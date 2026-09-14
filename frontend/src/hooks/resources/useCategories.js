import { useFetch } from '../useFetch';
import { categoriesApi } from '../../api/resources';

export function useCategories() {
  const { data, loading, initialLoading, error, reload } = useFetch(
    (signal) => categoriesApi.list(undefined, signal),
    []
  );
  return { categories: data?.categories || [], loading, initialLoading, error, reload };
}
