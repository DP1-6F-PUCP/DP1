import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/**
 * Botón conforme a la especificación de diseño:
 * - Default: #1F3864 (--color-primary), texto blanco
 * - Hover: Oscurecido un 10%
 * - Focus: Anillo de foco de 2px en #4C7CBF (--color-secondary)
 * - Active / Pressed: Oscurecido 15% y escala 0.98
 * - Disabled: Opacidad 40%, cursor not-allowed
 * - Loading: Reemplazo con spinner conservando ancho para evitar saltos de layout
 * - Destructivos: #C62828 (--color-danger)
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className = '',
      ...props
    },
    ref
  ) => {
    // 6. Márgenes y padding basados en múltiplos de 4 (horizontal = 2x vertical)
    const sizeClasses = {
      sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg', // 12px font
      md: 'h-9 px-4 text-sm gap-2 rounded-lg',   // 14px font
      lg: 'h-11 px-5 text-base gap-2.5 rounded-xl', // 16px font
    }[size];

    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      danger: 'btn-danger',
      outline:
        'border border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#4C7CBF] active:scale-[0.98]',
      ghost:
        'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#4C7CBF] active:scale-[0.98]',
    }[variant];

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={`inline-flex items-center justify-center font-semibold select-none whitespace-nowrap outline-none transition-all ${sizeClasses} ${variantClasses} ${
          isLoading ? 'relative cursor-wait' : ''
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="opacity-0 flex items-center gap-1.5">
              {leftIcon}
              {children}
              {rightIcon}
            </span>
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-current" />
            </span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0 inline-flex items-center justify-center">{leftIcon}</span>}
            <span className="inline-flex items-center justify-center gap-1.5 leading-none">{children}</span>
            {rightIcon && <span className="shrink-0 inline-flex items-center justify-center">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
