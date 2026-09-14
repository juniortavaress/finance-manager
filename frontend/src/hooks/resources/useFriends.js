import { useFetch } from '../useFetch';
import { friendsApi } from '../../api/resources';

export function useFriends() {
  const { data, loading, initialLoading, error, reload } = useFetch((signal) => friendsApi.list(signal), []);
  return { friends: data?.friends || [], loading, initialLoading, error, reload };
}
