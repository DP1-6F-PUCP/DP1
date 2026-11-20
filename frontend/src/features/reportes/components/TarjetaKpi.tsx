import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Minus, OctagonAlert } from 'lucide-react';

export type TonoKpi = 'neutro' | 'bien' | 'atencion' | 'critico';

/** El semáforo siempre va con ícono + texto (nunca solo color). */
const TONO: Record<TonoKpi, { borde: string; chip: string; icono: React.ElementType | null; texto: string }> = {
  neutro: { borde: 'border-slate-200 dark:border-slate-700/70', chip: '', icono: null, texto: '' },
  bien: { borde: 'border-emerald-500/50', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icono: CheckCircle2, texto: 'Bien' },
  atencion: { borde: 'border-amber-500/60', chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icono: AlertTriangle, texto: 'Atención' },
  critico: { borde: 'border-rose-500/60', chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icono: OctagonAlert, texto: 'Crítico' },
};

/** Tendencia mínima: una línea de 1,5 px en tinta neutra con el último punto marcado. */
export const Sparkline: React.FC<{ valores: (number | null)[]; ancho?: number; alto?: number }> = ({ valores, ancho = 96, alto = 26 }) => {
  const v = valores.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 2) return <div style={{ width: ancho, height: alto }} aria-hidden />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const rango = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (ancho - 4) + 2, alto - 3 - ((y - min) / rango) * (alto - 6)]);
  const [ux, uy] = pts[pts.length - 1];
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden className="shrink-0 text-cyan-600 dark:text-cyan-400">
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ux} cy={uy} r={2.5} fill="currentColor" />
    </svg>
  );
};

interface Props {
  icono: React.ElementType;
  titulo: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: TonoKpi;
  /** Texto del chip de estado (si no, el genérico del tono). */
  estado?: string;
  serie?: (number | null)[];
  /** Variación en el rango elegido, ya formateada; `sentido` dice si subir es bueno. */
  delta?: { texto: string; sube: boolean; bueno: boolean | null } | null;
  ayuda: string;
}

/** KPI: rótulo, cifra grande, detalle, estado del semáforo y tendencia del rango. */
export const TarjetaKpi: React.FC<Props> = ({ icono: Icono, titulo, valor, detalle, tono = 'neutro', estado, serie, delta, ayuda }) => {
  const e = TONO[tono];
  const IconoTono = e.icono;
  const Flecha = !delta ? Minus : delta.sube ? ArrowUpRight : ArrowDownRight;
  const colorDelta = !delta || delta.bueno == null ? 'text-slate-500 dark:text-slate-400'
    : delta.bueno ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <div role="group" aria-label={`${titulo}: ${ayuda}`} title={ayuda}
      className={`flex min-w-0 flex-col justify-between gap-1 rounded-xl border bg-[var(--color-surface)] p-3 shadow-sm ${e.borde}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{titulo}</span>
        </span>
        {IconoTono && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-semibold ${e.chip}`}>
            <IconoTono className="h-3 w-3" aria-hidden />{estado ?? e.texto}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-50">{valor}</div>
          {detalle && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{detalle}</div>}
        </div>
        {serie && <Sparkline valores={serie} />}
      </div>
      {delta !== undefined && (
        <div className={`inline-flex items-center gap-1 text-[11px] font-medium ${colorDelta}`}>
          <Flecha className="h-3 w-3" aria-hidden />{delta ? delta.texto : 'Sin variación registrada'}
        </div>
      )}
    </div>
  );
};
