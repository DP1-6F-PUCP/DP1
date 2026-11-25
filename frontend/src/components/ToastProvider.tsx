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
/** Tope del historial por ejecución (antes crecía sin límite hasta llenar la cuota del navegador). */
const MAX_NOTIFICACIONES = 200;
/** Historiales de ejecuciones que se conservan; los de ejecuciones más viejas se borran. */
const MAX_HISTORIALES = 5;

/**
 * Borra los historiales de ejecuciones viejas (había una clave por ejecución que nunca se borraba).
 * Se queda con los MAX_HISTORIALES más recientes según la notificación más nueva de cada uno.
 */
const limpiarHistorialesViejos = (scopeActual: string) => {
  try {
    const prefijo = `${NOTIFICATION_HISTORY_KEY}:`;
    const historiales: { clave: string; ultima: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (!clave?.startsWith(prefijo) || clave === prefijo + scopeActual) continue;
      let ultima = 0;
      try {
        const lista: unknown = JSON.parse(localStorage.getItem(clave) ?? '[]');
        if (Array.isArray(lista) && typeof lista[0]?.createdAt === 'number') ultima = lista[0].createdAt;
      } catch {
        // dato corrupto: se trata como el más viejo
      }
      historiales.push({ clave, ultima });
    }
    historiales.sort((a, b) => b.ultima - a.ultima);
    historiales.slice(MAX_HISTORIALES - 1).forEach(({ clave }) => localStorage.removeItem(clave));
  } catch {
    // sin storage: nada que limpiar
  }
};

const getStoredNotifications = (scope: string): ToastItem[] => {
  if (typeof window === 'undefined') return [];

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(`${NOTIFICATION_HISTORY_KEY}:${scope}`);
  } catch {
    return [];
  }
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
    }).slice(0, MAX_NOTIFICACIONES);
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
      limpiarHistorialesViejos(historyScope);
      return;
    }

    try {
      localStorage.setItem(
        `${NOTIFICATION_HISTORY_KEY}:${historyScope}`,
        JSON.stringify(notifications)
      );
    } catch {
      // Cuota llena o sin storage: el historial solo dura esta sesión (antes la excepción rompía el efecto).
    }
  }, [historyScope, notifications]);

  useEffect(() => {
    limpiarHistorialesViejos(loadedScopeRef.current);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newToast: ToastItem = { ...toast, id, createdAt: Date.now() };
      setToasts((prev) => [newToast, ...prev].slice(0, 5));
      setNotifications((prev) => [newToast, ...prev].slice(0, MAX_NOTIFICACIONES));

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
        // Debajo de la barra superior (h-14): en top-4 tapaba el botón Detener varios segundos.
        className="tema-panel fixed top-[4.5rem] right-4 z-[2000] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
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
