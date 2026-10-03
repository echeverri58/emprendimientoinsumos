import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async loader whenever `deps` change, with cancellation.
 *
 * Socrata queries are slow enough (0.3s-4s) that a user can easily change filters
 * mid-flight; aborting the previous request prevents a stale response from
 * overwriting newer data.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} loader
 * @param {any[]} deps
 * @param {{ enabled?: boolean }} [options]
 */
export function useApiResource(loader, deps, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return;
        setError(err);
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload, setData };
}

/**
 * Debounce a rapidly changing value (the search box).
 * @template T
 * @param {T} value
 * @param {number} delay
 */
export function useDebounced(value, delay = 450) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Close on Escape, used by the drawer and mobile filter sheet. */
export function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
