import { useCallback, useEffect, useRef, useState } from 'react';
import { CONNECTION, ERROR_KINDS, apiFetch, isApiError, subscribeToConnection } from '../utils/apiClient';

// The load/error/empty bookkeeping every page used to repeat by hand — and
// usually got only half right, which is why a failed load so often showed
// nothing at all. Pair it with <DataState /> and a page covers all four states
// in one line of JSX.

const initialState = {
  data: null,
  loading: true,
  refreshing: false,
  error: null,
  lastUpdatedAt: null
};

/**
 * Run an async loader and track its full lifecycle.
 *
 * @param loader  (signal) => Promise<data> — receives an AbortSignal that fires
 *                on unmount and whenever the deps change.
 * @param deps    dependency list; changing it reloads.
 * @param options skip — hold off loading (e.g. an id isn't known yet);
 *                initialData — what `data` holds before the first load;
 *                autoRetryOnReconnect — retry once the connection is back
 *                (default true), which is what makes a server restart heal
 *                itself without the user touching anything.
 */
export const useAsyncData = (loader, deps = [], options = {}) => {
  const { skip = false, initialData = null, autoRetryOnReconnect = true } = options;

  const [state, setState] = useState({ ...initialState, data: initialData, loading: !skip });
  const loaderRef = useRef(loader);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const runRef = useRef(0);

  loaderRef.current = loader;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = runRef.current + 1;
    runRef.current = runId;

    // A reload that already has data on screen keeps showing it and only marks
    // itself `refreshing`; replacing a full table with a skeleton on every
    // refresh reads as a crash, not as progress.
    setState((prev) => (prev.lastUpdatedAt
      ? { ...prev, refreshing: true, error: null }
      : { ...prev, loading: true, error: null }));

    try {
      const data = await loaderRef.current(controller.signal);
      if (!mountedRef.current || runRef.current !== runId) return;
      setState({
        data,
        loading: false,
        refreshing: false,
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current || runRef.current !== runId) return;
      setState((prev) => ({ ...prev, loading: false, refreshing: false, error }));
    }
  }, []);

  useEffect(() => {
    if (skip) {
      setState((prev) => ({ ...prev, loading: false }));
      return undefined;
    }
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, run, ...deps]);

  // A failure that was the connection's fault heals itself the moment the
  // connection is back, so the user never has to guess whether to press retry.
  useEffect(() => {
    if (!autoRetryOnReconnect || skip) return undefined;
    return subscribeToConnection((connection) => {
      if (connection.status !== CONNECTION.ONLINE) return;
      setState((prev) => {
        const error = prev.error;
        const worthRetrying = isApiError(error) && [
          ERROR_KINDS.OFFLINE,
          ERROR_KINDS.NETWORK,
          ERROR_KINDS.TIMEOUT,
          ERROR_KINDS.DB_DOWN,
          ERROR_KINDS.STARTING
        ].includes(error.kind);
        if (worthRetrying) setTimeout(run, 0);
        return prev;
      });
    });
  }, [autoRetryOnReconnect, skip, run]);

  return { ...state, reload: run, setData: (data) => setState((prev) => ({ ...prev, data })) };
};

/**
 * The common case: one GET, whose JSON body is the data.
 *
 *   const { data, loading, error, reload } = useApiData('/api/students');
 */
export const useApiData = (path, { deps = [], ...options } = {}) => useAsyncData(
  (signal) => apiFetch(path, { signal }),
  [path, ...deps],
  options
);

export default useAsyncData;
