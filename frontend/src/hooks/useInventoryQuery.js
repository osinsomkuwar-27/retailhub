// Same contract as Module 3's useIntelQuery:
//   const q = useInventoryQuery(() => api.call(params), [deps], { interval })
//   → { data, meta, loading, error, reload }
import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../services/inventoryService';

export default function useInventoryQuery(fetcher, deps = [], { interval, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null });
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher();
      if (id === reqId.current) setState({ data: res?.data ?? null, meta: res?.meta || null, loading: false, error: null });
    } catch (e) {
      if (id === reqId.current) setState((s) => ({ ...s, loading: false, error: errMsg(e) }));
    }
  }, [enabled, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!interval) return undefined;
    const t = setInterval(reload, interval);
    return () => clearInterval(t);
  }, [interval, reload]);

  return { ...state, reload };
}

/** Page/sort/filter state for server-paginated lists. */
export function useListState(initial = {}) {
  const [f, setF] = useState({ page: 1, limit: 15, ...initial });
  const set = useCallback((patch) => setF((s) => ({ ...s, page: 1, ...patch })), []);
  const setPage = useCallback((page) => setF((s) => ({ ...s, page })), []);
  const toggleSort = useCallback((key) => setF((s) => ({ ...s, sort: s.sort === key ? `-${key}` : key })), []);
  return { f, set, setPage, toggleSort };
}
