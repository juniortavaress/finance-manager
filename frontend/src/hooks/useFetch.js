import { useCallback, useEffect, useRef, useState } from 'react';

export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);
  const controllerRef = useRef(null);

  // Reseta hasLoadedOnce sempre que as deps mudam (nao so' na primeira
  // montagem) - senao, um segundo useFetch para um ID diferente (ex: trocar
  // de ativo no mesmo modal aberto) herda hasLoadedOnce=true da carga
  // anterior e initialLoading vira false na hora, pulando o skeleton e
  // mostrando o empty-state por um instante com os dados do ID errado/vazios.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    hasLoadedOnce.current = false;
  }, deps);

  const reload = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    fetcher(controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setData(res);
        hasLoadedOnce.current = true;
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
    return () => controllerRef.current?.abort();
  }, [reload]);

  const initialLoading = loading && !hasLoadedOnce.current;

  return { data, loading, initialLoading, error, reload };
}
