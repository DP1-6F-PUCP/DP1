import React, { useEffect, useState } from 'react';
import { AlertItem } from '../types';
import { AlertTriangle, ShieldAlert, X, ExternalLink } from 'lucide-react';

interface ToastContainerProps {
  toasts: AlertItem[];
  onDismiss: (id: string) => void;
  onSelectVehicle?: (vehicleId: string) => void;
  isDarkTheme?: boolean;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
  onSelectVehicle,
  isDarkTheme = true,
}) => {
  return (
    <div
      id="notification-toast-container"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] sm:w-96 pointer-events-none select-none"
    >
      {toasts.map((toast, idx) => (
        <ToastCard
          key={`${toast.id}-${idx}`}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          onSelectVehicle={onSelectVehicle}
          isDarkTheme={isDarkTheme}
        />
      ))}
    </div>
  );
};

interface ToastCardProps {
  toast: AlertItem;
  onDismiss: () => void;
  onSelectVehicle?: (vehicleId: string) => void;
  isDarkTheme?: boolean;
}

const ToastCard: React.FC<ToastCardProps> = ({
  toast,
  onDismiss,
  onSelectVehicle,
  isDarkTheme = true,
}) => {
  const isCritical = toast.urgency === 'critical' || toast.type === 'breakdown';
  const isHigh = toast.urgency === 'high';
  const [progress, setProgress] = useState(100);
  const DURATION_MS = 4000; // Estándar: 4 segundos

  useEffect(() => {
    // Si es alerta crítica o de avería/error, no desaparece automáticamente
    if (isCritical) {
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remainingPct);

      if (elapsed >= DURATION_MS) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onDismiss, isCritical]);

  return (
    <div
      role="alert"
      id={`toast-alert-${toast.id}`}
      onClick={() => {
        if (toast.relatedVehicleId && onSelectVehicle) {
          onSelectVehicle(toast.relatedVehicleId);
          onDismiss();
        }
      }}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 cursor-pointer ${
        isDarkTheme
          ? isCritical
            ? 'bg-slate-900/95 border-rose-500/70 text-slate-100 shadow-rose-950/60'
            : isHigh
            ? 'bg-slate-900/95 border-amber-500/70 text-slate-100 shadow-amber-950/60'
            : 'bg-slate-900/95 border-blue-500/70 text-slate-100 shadow-blue-950/60'
          : isCritical
          ? 'bg-[var(--color-surface)] border-[var(--color-danger)] text-[var(--color-text-primary)] shadow-xl'
          : isHigh
          ? 'bg-[var(--color-surface)] border-[var(--color-warning)] text-[var(--color-text-primary)] shadow-xl'
          : 'bg-[var(--color-surface)] border-[var(--color-secondary)] text-[var(--color-text-primary)] shadow-xl'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <div
            className={`p-1.5 rounded-lg border ${
              isCritical
                ? 'bg-rose-500/20 border-rose-500/40 text-[var(--color-danger)]'
                : isHigh
                ? 'bg-amber-500/20 border-amber-500/40 text-[var(--color-warning)]'
                : 'bg-blue-500/20 border-blue-500/40 text-[var(--color-primary)]'
            }`}
          >
            {isCritical ? (
              <AlertTriangle className="h-4 w-4 animate-bounce" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
          </div>
          <div>
            <span
              className={`text-[9px] uppercase font-bold tracking-wider block ${
                isCritical
                  ? isDarkTheme ? 'text-rose-400' : 'text-[var(--color-danger)]'
                  : isHigh
                  ? isDarkTheme ? 'text-amber-400' : 'text-[var(--color-warning)]'
                  : isDarkTheme ? 'text-blue-400' : 'text-[var(--color-primary)]'
              }`}
            >
              {isCritical
                ? 'Alerta Crítica del Sistema'
                : isHigh
                ? 'Advertencia de Ruta'
                : 'Notificación'}
            </span>
            <h4
              className={`font-bold text-xs leading-snug ${
                isDarkTheme ? 'text-white' : 'text-[var(--color-text-primary)]'
              }`}
            >
              {toast.title}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span
            className={`text-[9px] font-mono-code ${
              isDarkTheme ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {toast.timestamp || 'Ahora'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className={`p-1 rounded transition-colors ${
              isDarkTheme
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
            }`}
            title="Cerrar notificación"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Description */}
      <p
        className={`text-[11px] leading-relaxed pl-8 ${
          isDarkTheme ? 'text-slate-300' : 'text-slate-700'
        }`}
      >
        {toast.description}
      </p>

      {/* Click hint */}
      {toast.relatedVehicleId && (
        <div className="flex items-center gap-1 text-[9px] text-blue-500 font-mono-code mt-1.5 pl-8 hover:underline">
          <span>Ver vehículo en mapa</span>
          <ExternalLink className="h-2.5 w-2.5" />
        </div>
      )}

      {/* Progress countdown bar (desaparición automática tras 4s sólo para no críticas) */}
      {!isCritical && (
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 ${
            isDarkTheme ? 'bg-slate-800' : 'bg-slate-200'
          }`}
        >
          <div
            className={`h-full transition-all duration-75 ease-linear ${
              isHigh ? 'bg-[#F9A825]' : 'bg-[#4C7CBF]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
