import { useCallback, useEffect, useRef, useState } from 'react';

// Cache em memoria (stale-while-revalidate): com `cacheKey`, ao voltar para uma
// tela o ultimo resultado aparece na hora e a atualizacao roda em segundo
// plano, sem skeleton - a navegacao entre telas fica instantanea como num app.
// So' vive na sessao da aba; e' limpo no login/logout (clearFetchCache).
const cache = new Map();

export function clearFetchCache() {
  cache.clear();
}

export function useFetch(fetcher, deps = [], { cacheKey } = {}) {
  const fullKey = cacheKey ? `${cacheKey}|${JSON.stringify(deps)}` : null;
  const cachedAtMount = fullKey ? cache.get(fullKey) : undefined;

  const [data, setData] = useState(cachedAtMount === undefined ? null : cachedAtMount);
  const [loading, setLoading] = useState(cachedAtMount === undefined);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(cachedAtMount !== undefined);
  const silentNext = useRef(cachedAtMount !== undefined);
  const controllerRef = useRef(null);
  const keyRef = useRef(fullKey);
  keyRef.current = fullKey;

  // Reseta hasLoadedOnce sempre que as deps mudam (nao so' na primeira
  // montagem) - senao, um segundo useFetch para um ID diferente (ex: trocar
  // de ativo no mesmo modal aberto) herda hasLoadedOnce=true da carga
  // anterior e initialLoading vira false na hora, pulando o skeleton e
  // mostrando o empty-state por um instante com os dados do ID errado/vazios.
  // Se ja existe resultado em cache para as novas deps, ele e' mostrado direto.
  const isFirstRun = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const hit = fullKey && cache.has(fullKey);
    hasLoadedOnce.current = Boolean(hit);
    silentNext.current = Boolean(hit);
    if (hit) setData(cache.get(fullKey));
  }, [fullKey, ...deps]);

  const reload = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const silent = silentNext.current;
    silentNext.current = false;
    if (!silent) setLoading(true);
    setError(null);
    fetcher(controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (keyRef.current) cache.set(keyRef.current, res);
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

  return { data, setData, loading, initialLoading, error, reload };
}
