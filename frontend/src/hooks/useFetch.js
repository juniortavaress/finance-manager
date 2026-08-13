import { useCallback, useEffect, useRef, useState } from 'react';

export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        setData(res);
        hasLoadedOnce.current = true;
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  const initialLoading = loading && !hasLoadedOnce.current;

  return { data, loading, initialLoading, error, reload };
}
