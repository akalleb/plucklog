'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  createdAt: number;
};

type ToastInput = {
  kind: ToastKind;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastContextType = {
  notify: (t: ToastInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

const kindClasses: Record<ToastKind, { wrap: string; pill: string }> = {
  success: { wrap: 'border-green-200 bg-green-50', pill: 'bg-green-600 text-white' },
  error: { wrap: 'border-red-200 bg-red-50', pill: 'bg-red-600 text-white' },
  info: { wrap: 'border-blue-200 bg-blue-50', pill: 'bg-blue-600 text-white' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeouts = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const handle = timeouts.current.get(id);
    if (handle) window.clearTimeout(handle);
    timeouts.current.delete(id);
  }, []);

  const notify = useCallback(
    ({ kind, title, message, durationMs }: ToastInput) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const toast: Toast = { id, kind, title, message, createdAt: Date.now() };
      setToasts(prev => [toast, ...prev].slice(0, 6));
      const ttl = Math.max(1500, Math.min(15000, durationMs ?? (kind === 'error' ? 7000 : 4500)));
      const handle = window.setTimeout(() => remove(id), ttl);
      timeouts.current.set(id, handle);
    },
    [remove],
  );

  const value = useMemo<ToastContextType>(
    () => ({
      notify,
      success: (message, title) => notify({ kind: 'success', title, message }),
      error: (message, title) => notify({ kind: 'error', title, message }),
      info: (message, title) => notify({ kind: 'info', title, message }),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-60 w-[min(420px,calc(100vw-2rem))] space-y-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`rounded-xl border shadow-sm p-4 transition-all duration-200 animate-[toastIn_200ms_ease-out] ${kindClasses[t.kind].wrap}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${kindClasses[t.kind].pill}`}>
                    {t.kind === 'success' ? 'OK' : t.kind === 'error' ? 'ERRO' : 'INFO'}
                  </span>
                  {t.title && <span className="text-sm font-semibold text-gray-900 truncate">{t.title}</span>}
                </div>
                <div className="mt-1 text-sm text-gray-800">{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Fechar
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

