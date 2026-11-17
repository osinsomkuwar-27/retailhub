import { useCallback, useEffect, useState } from 'react';

export default function useIntelQuery(fetcher, deps = [], { interval = 0 } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async (silent) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher();
      setState({ data: res.data, meta: res.meta || null, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.response?.data?.message || e.message }));
    }
  }, deps);
  useEffect(() => {
    load(false);
    if (!interval) return undefined;
    const t = setInterval(() => load(true), interval);
    return () => clearInterval(t);
  }, [load, interval]);
  return { ...state, reload: () => load(false) };
}