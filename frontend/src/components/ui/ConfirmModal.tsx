import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  isDarkTheme?: boolean;
}

/**
 * Modal centrado para confirmaciones explícitas de acciones destructivas (7. Retroalimentación visual)
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  isLoading = false,
  isDarkTheme = true,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <div
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border space-y-4 ${
          isDarkTheme
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)]'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                isDestructive
                  ? 'bg-red-500/15 border-red-500/30 text-[var(--color-danger)]'
                  : 'bg-blue-500/15 border-blue-500/30 text-[var(--color-primary)]'
              }`}
            >
              <AlertTriangle className="h-6 w-6" aria-label="Icono de advertencia" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-lg font-bold">
                {title}
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] dark:text-slate-400 mt-0.5">
                Esta acción requiere confirmación explícita
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal de confirmación"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] dark:text-slate-300">
          {description}
        </p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
