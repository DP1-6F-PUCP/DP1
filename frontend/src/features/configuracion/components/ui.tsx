import React, { useId } from 'react';
import { AlertCircle, Lock, Zap } from 'lucide-react';

/**
 * Piezas visuales de Configuración (claro/oscuro con `dark:` y las variables de superficie, igual
 * que PedidosPage). Las usan la página y el modal de la pantalla de inicio.
 */
export const BORDE = 'border-slate-200 dark:border-slate-700/70';
export const TEXTO_FUERTE = 'text-slate-900 dark:text-slate-100';
export const TEXTO = 'text-slate-700 dark:text-slate-300';
export const TEXTO_TENUE = 'text-slate-500 dark:text-slate-400';

export const BOTON_SECUNDARIO = `inline-flex items-center justify-center gap-1.5 rounded-lg border ${BORDE} bg-[var(--color-surface)] px-3 py-2 text-sm font-medium ${TEXTO} transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-slate-500 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`;
export const BOTON_PRIMARIO = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';

/** Tarjeta de un grupo de campos, con título y descripción corta. */
export const Tarjeta: React.FC<{
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  accion?: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, descripcion, accion, children }) => (
  <section className={`rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
    <header className={`flex flex-wrap items-start justify-between gap-2 border-b ${BORDE} px-4 py-3`}>
      <div className="min-w-0">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${TEXTO_FUERTE}`}>{titulo}</h3>
        {descripcion && <p className={`mt-0.5 text-xs ${TEXTO_TENUE}`}>{descripcion}</p>}
      </div>
      {accion}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

/** Encabezado de un bloque (pestaña): título, descripción y leyenda de cuándo se aplica. */
export const EncabezadoBloque: React.FC<{ titulo: string; descripcion: string; children?: React.ReactNode }> = ({ titulo, descripcion, children }) => (
  <div className="mb-4">
    <h2 className={`text-lg font-semibold ${TEXTO_FUERTE}`}>{titulo}</h2>
    <p className={`mt-0.5 text-sm ${TEXTO_TENUE}`}>{descripcion}</p>
    {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
  </div>
);

export type Aplicacion = 'caliente' | 'inicio';

/** Distintivo de cuándo se aplica un campo: en caliente (próximo lote) o solo al iniciar. */
export const Insignia: React.FC<{ tipo: Aplicacion; compacta?: boolean }> = ({ tipo, compacta }) =>
  tipo === 'caliente' ? (
    <span title="Se puede cambiar con la simulación en curso: se aplica en el próximo lote"
      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
      <Zap className="h-3 w-3" aria-hidden />{compacta ? 'En caliente' : 'En caliente · próximo lote'}
    </span>
  ) : (
    <span title="Solo se define al iniciar la simulación"
      className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
      <Lock className="h-3 w-3" aria-hidden />Solo al inicio
    </span>
  );

/** Campo numérico con etiqueta, unidad, ayuda, error en línea, valor oficial y estado bloqueado. */
export const CampoNumero: React.FC<{
  label: string;
  unidad?: string;
  ayuda?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  oficial?: number | string;
  modificado?: boolean;
  min?: number;
  max?: number;
  paso?: number;
  aplicacion?: Aplicacion;
  bloqueado?: boolean;
  motivoBloqueo?: string;
  compacto?: boolean;
}> = ({ label, unidad, ayuda, value, onChange, error, oficial, modificado, min, max, paso, aplicacion, bloqueado, motivoBloqueo, compacto }) => {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda || bloqueado ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className={`flex items-center gap-1.5 text-xs font-medium ${TEXTO}`}>
          {label}
          {modificado && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Modificado, sin guardar" aria-label="modificado" />}
        </label>
        {aplicacion && !compacto && <Insignia tipo={aplicacion} compacta />}
      </div>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={paso}
          value={value}
          disabled={bloqueado}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={`h-9 w-full rounded-lg border bg-white pl-3 ${unidad ? 'pr-16' : 'pr-3'} font-mono-code text-sm text-slate-900 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-950/60 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500 ${
            error
              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
              : `${BORDE} focus:border-blue-500 focus:ring-blue-500/20`}`}
        />
        {unidad && (
          <span className={`pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs ${TEXTO_TENUE}`}>
            {bloqueado ? <Lock className="h-3.5 w-3.5" aria-hidden /> : unidad}
          </span>
        )}
      </div>
      {error ? (
        <p id={idError} className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />{error}
        </p>
      ) : bloqueado && motivoBloqueo ? (
        <p id={idAyuda} className={`text-xs ${TEXTO_TENUE}`}>{motivoBloqueo}</p>
      ) : (ayuda || oficial !== undefined) && !compacto ? (
        <p id={idAyuda} className={`text-xs leading-snug ${TEXTO_TENUE}`}>
          {ayuda}
          {oficial !== undefined && (
            <span className="whitespace-nowrap">{ayuda ? ' · ' : ''}Oficial: <span className="font-mono-code">{oficial}</span></span>
          )}
        </p>
      ) : null}
    </div>
  );
};

/** Aviso en línea (información, advertencia o error). */
export const Aviso: React.FC<{ tono?: 'info' | 'advertencia' | 'error'; icono?: React.ReactNode; children: React.ReactNode }> = ({ tono = 'info', icono, children }) => {
  const clases = {
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100',
    advertencia: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
    error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100',
  }[tono];
  return (
    <div role={tono === 'error' ? 'alert' : undefined} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${clases}`}>
      {icono && <span className="mt-0.5 shrink-0">{icono}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
};
