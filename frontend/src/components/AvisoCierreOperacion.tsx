import React from 'react';
import { AlertCircle, CheckCircle2, FileText, LogOut, Loader2 } from 'lucide-react';
import type { ReporteSimulacionDTO } from '../types/backend';
import { formatFechaHoraCorta, parseBackendSimulatedTime } from '../utils/backendTime';
import { useEstadoVisual } from '../engine/useEstadoVisual';

interface Props {
  reporte: ReporteSimulacionDTO | undefined;
  /** true: el mapa aún no llega al cierre (el reporte se abrirá solo); false: reporte cerrado con "×". */
  esperando: boolean;
  onVerReporte: () => void;
  /** Solo con el reporte cerrado: terminar y volver al inicio (lo mismo que "Aceptar"). */
  onSalir?: () => void;
  /** Clic en el código del pedido incumplido: seleccionarlo y centrarlo en el mapa. */
  onIrAPedido?: (idPedido: string) => void;
}

/**
 * Aviso NO bloqueante sobre el mapa cuando la ejecución ya terminó en el backend: mientras el reloj
 * visible llega al cierre ("La operación se detendrá: PED-… venció 04/08 02:57") y, después, si el
 * operador cerró el reporte para revisar el mapa final ("Operación detenida", con Reporte / Salir).
 */
export const AvisoCierreOperacion: React.FC<Props> = ({ reporte, esperando, onVerReporte, onSalir, onIrAPedido }) => {
  const colapso = !reporte || reporte.motivoFinalizacion === 'COLAPSO';
  const incumplidos = (reporte?.pedidosFinales ?? [])
    .filter((p) => p.estado === 'INCUMPLIDA')
    .sort((a, b) => parseBackendSimulatedTime(a.fechaLimite) - parseBackendSimulatedTime(b.fechaLimite));
  const primero = incumplidos[0];
  // El backend detiene la operación al cierre del lote, que el mapa (retrasado) puede no haber
  // alcanzado: "vence" mientras el reloj visible no llega al límite, "venció" después.
  const { marcaVisibleMs } = useEstadoVisual();
  const limitePrimero = primero ? parseBackendSimulatedTime(primero.fechaLimite) : NaN;
  const verbo = marcaVisibleMs != null && limitePrimero <= marcaVisibleMs ? 'venció' : 'vence';
  const titulo = esperando
    ? colapso ? 'La operación se detendrá' : 'La operación termina'
    : colapso ? 'Operación detenida' : 'Operación finalizada';
  const tono = colapso
    ? 'border-rose-500 bg-white/95 text-rose-700 dark:bg-slate-900/95 dark:text-rose-300'
    : 'border-blue-500 bg-white/95 text-blue-700 dark:bg-slate-900/95 dark:text-blue-300';
  const boton = 'inline-flex items-center gap-1 rounded-md border border-current px-2 py-0.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400';

  return (
    <div role="status" aria-live="polite"
      className={`pointer-events-auto absolute left-1/2 top-16 z-[1600] flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 px-3 py-1.5 text-sm shadow-xl backdrop-blur-sm ${tono}`}>
      {colapso ? <AlertCircle className={`h-4 w-4 shrink-0 ${esperando ? 'animate-pulse' : ''}`} aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="font-semibold">{titulo}</span>
      {colapso && (primero ? (
        <span className="text-slate-700 dark:text-slate-200">
          {onIrAPedido ? (
            <button type="button" onClick={() => onIrAPedido(primero.idPedido)} title="Ver el pedido en el mapa"
              className="font-mono-code font-semibold underline decoration-dotted underline-offset-2 hover:text-cyan-700 dark:hover:text-cyan-300">
              {primero.idPedido}
            </button>
          ) : <span className="font-mono-code font-semibold">{primero.idPedido}</span>}
          {' '}{verbo} <span className="font-mono-code">{formatFechaHoraCorta(parseBackendSimulatedTime(primero.fechaLimite))}</span>
          {incumplidos.length > 1 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">+{incumplidos.length - 1}</span>}
        </span>
      ) : !reporte ? (
        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />un pedido no llegó a tiempo
        </span>
      ) : null)}
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={onVerReporte} className={boton} title="Abrir el reporte de cierre">
          <FileText className="h-3.5 w-3.5" aria-hidden />Reporte
        </button>
        {onSalir && (
          <button type="button" onClick={onSalir} className={boton} title="Terminar y volver al inicio">
            <LogOut className="h-3.5 w-3.5" aria-hidden />Salir
          </button>
        )}
      </span>
    </div>
  );
};
