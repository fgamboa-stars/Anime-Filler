import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: T | undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: T | undefined; error: Error };

/**
 * Run an abortable async function whenever `key` changes. Pass `null` as the
 * key to stay idle. Stale responses are ignored; `retry()` re-runs it.
 */
export function useAsync<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: key ? 'loading' : 'idle', data: undefined, error: undefined } as AsyncState<T>);
  const [attempt, setAttempt] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!key) {
      setState({ status: 'idle', data: undefined, error: undefined });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', data: prev.data, error: undefined }));
    fnRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data, error: undefined });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return;
        setState((prev) => ({ status: 'error', data: prev.data, error: error instanceof Error ? error : new Error(String(error)) }));
      });
    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
