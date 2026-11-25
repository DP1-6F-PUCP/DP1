import React from 'react';
import { AlertOctagon, CheckCircle2, FileText, LogOut, Loader2 } from 'lucide-react';
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
 * Franja a todo el ancho bajo la barra superior cuando la ejecución ya terminó en el backend: mientras
 * el reloj visible llega al cierre ("La operación se detendrá: PED-… venció 04/08 02:57") y, después, si
 * el operador cerró el reporte para revisar el mapa final ("Operación detenida", con Reporte / Salir).
 *
 * Con un incumplimiento es roja sólida y late: antes era una píldora de 38 px sobre el mapa y pasaba
 * desapercibida. Va en el flujo (empuja el contenido) para no tapar el mapa ni los paneles.
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
  const tono = colapso ? 'bg-rose-700' : 'bg-blue-700';
  const boton = 'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <div data-aviso-cierre role={colapso ? 'alert' : 'status'}
      className={`relative z-[1600] flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-2 overflow-hidden px-4 py-3 text-white shadow-lg ${tono}`}>
      {/* Latido del fondo (no del texto, que debe seguir legible). */}
      {colapso && esperando && <span className="pointer-events-none absolute inset-0 bg-rose-500/50 motion-safe:animate-pulse" aria-hidden />}
      <span className="relative flex items-center gap-3">
        {colapso ? <AlertOctagon className="h-7 w-7 shrink-0" aria-hidden /> : <CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden />}
        <span className="text-lg font-bold leading-tight">{titulo}</span>
      </span>
      {colapso && (primero ? (
        <span className="relative text-base">
          {onIrAPedido ? (
            <button type="button" onClick={() => onIrAPedido(primero.idPedido)} title="Ver el pedido en el mapa"
              className="font-mono-code font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid">
              {primero.idPedido}
            </button>
          ) : <span className="font-mono-code font-semibold">{primero.idPedido}</span>}
          {' '}{verbo} <span className="font-mono-code font-semibold">{formatFechaHoraCorta(limitePrimero)}</span>
          {incumplidos.length > 1 && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-sm font-bold text-rose-700">+{incumplidos.length - 1}</span>}
        </span>
      ) : !reporte ? (
        <span className="relative inline-flex items-center gap-2 text-base">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />un pedido no llegó a tiempo
        </span>
      ) : null)}
      <span className="relative flex items-center gap-2">
        <button type="button" onClick={onVerReporte} title="Abrir el reporte de cierre"
          className={`${boton} bg-white hover:bg-slate-100 ${colapso ? 'text-rose-700' : 'text-blue-700'}`}>
          <FileText className="h-4 w-4" aria-hidden />Reporte
        </button>
        {onSalir && (
          <button type="button" onClick={onSalir} title="Terminar y volver al inicio"
            className={`${boton} border border-white/80 hover:bg-white/15`}>
            <LogOut className="h-4 w-4" aria-hidden />Salir
          </button>
        )}
      </span>
    </div>
  );
};
