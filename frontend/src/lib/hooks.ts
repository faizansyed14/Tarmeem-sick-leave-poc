"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";

export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Fetches a resource and exposes loading, error, data and a reload function. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const res = await api<T>(path, { signal: c.signal });
      setData(res);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(errorMessage(err));
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, setData, error, loading, reload: load };
}
