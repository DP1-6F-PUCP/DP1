import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  createdAt: number;
}

interface ToastContextType {
  addToast: (toast: Omit<ToastItem, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
  notifications: ToastItem[];
}

const NOTIFICATION_HISTORY_KEY = 'sysmile_notification_history';

const getStoredNotifications = (scope: string): ToastItem[] => {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(`${NOTIFICATION_HISTORY_KEY}:${scope}`);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ToastItem => {
      if (!item || typeof item !== 'object') return false;
      const notification = item as Partial<ToastItem>;
      return (
        typeof notification.id === 'string' &&
        ['success', 'error', 'warning', 'info'].includes(notification.type ?? '') &&
        typeof notification.title === 'string' &&
        (notification.description === undefined || typeof notification.description === 'string') &&
        typeof notification.createdAt === 'number'
      );
    });
  } catch {
    return [];
  }
};

const ToastContext = createContext<ToastContextType>({
  addToast: () => {},
  removeToast: () => {},
  notifications: [],
});

export const useToast = () => useContext(ToastContext);

interface ToastProviderProps {
  children: React.ReactNode;
  historyScope?: string;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  historyScope = 'global',
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<ToastItem[]>(() =>
    getStoredNotifications(historyScope)
  );
  const loadedScopeRef = useRef(historyScope);

  useEffect(() => {
    if (loadedScopeRef.current !== historyScope) {
      loadedScopeRef.current = historyScope;
      setNotifications(getStoredNotifications(historyScope));
      return;
    }

    localStorage.setItem(
      `${NOTIFICATION_HISTORY_KEY}:${historyScope}`,
      JSON.stringify(notifications)
    );
  }, [historyScope, notifications]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newToast: ToastItem = { ...toast, id, createdAt: Date.now() };
      setToasts((prev) => [newToast, ...prev].slice(0, 5));
      setNotifications((prev) => [newToast, ...prev]);

      setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast, notifications }}>
      {children}
      <aside
        id="toast-portal-region"
        aria-label="Notificaciones del sistema"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          let borderClass = 'border-blue-500/40 bg-slate-900/95 text-white';
          let Icon = Info;
          let iconColor = 'text-blue-400';

          if (t.type === 'error') {
            borderClass = 'border-rose-500/40 bg-slate-900/95 text-white';
            Icon = AlertCircle;
            iconColor = 'text-rose-400';
          } else if (t.type === 'success') {
            borderClass = 'border-emerald-500/40 bg-slate-900/95 text-white';
            Icon = CheckCircle2;
            iconColor = 'text-emerald-400';
          } else if (t.type === 'warning') {
            borderClass = 'border-amber-500/40 bg-slate-900/95 text-white';
            Icon = AlertTriangle;
            iconColor = 'text-amber-400';
          }

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-xl flex items-start gap-3 backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 ${borderClass}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-xs leading-tight">{t.title}</div>
                {t.description && (
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-snug break-words">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
};
