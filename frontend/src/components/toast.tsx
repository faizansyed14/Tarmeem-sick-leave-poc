"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; tone: "good" | "bad"; title: string; body?: string };
type Ctx = { success: (title: string, body?: string) => void; error: (title: string, body?: string) => void };

const ToastContext = createContext<Ctx>({ success: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3800);
  }, []);

  const value = {
    success: useCallback((title: string, body?: string) => push("good", title, body), [push]),
    error: useCallback((title: string, body?: string) => push("bad", title, body), [push]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-rise gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop">
            {t.tone === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[13px] text-muted">{t.body}</div>}
            </div>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-faint hover:text-ink" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
