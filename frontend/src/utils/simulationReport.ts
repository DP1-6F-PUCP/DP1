import type { ReporteSimulacionDTO } from '../types/backend';
import { formatBackendSimulatedTime24, parseBackendSimulatedTime } from './backendTime';

// «Detener» es el texto del botón rojo de la barra superior (antes decía «Parar»).
export const motivosReporte = { COLAPSO: 'Colapso por incumplimiento', PARADA_MANUAL: 'Detenida por el operador',
  REINICIO_SERVIDOR: 'Interrumpida por un reinicio del sistema',
  PERIODO_COMPLETADO: 'Periodo de simulación completado' };
// Mismos nombres que la barra superior (OperacionTopbar): uno solo en todo el sistema.
export const escenariosReporte = { DIA_A_DIA: 'Tiempo Real', CINCO_DIAS: 'Simulación 5 Días', COLAPSO_LOGISTICO: 'Colapso Logístico' };

/** Duración compacta sin unidades vacías: "4d 13h", "2h 05m", "10m 46s". */
export function duracionReporte(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${dos(h)}h`;
  if (h > 0) return `${h}h ${dos(m)}m`;
  return `${m}m ${dos(s % 60)}s`;
}

/** Instante simulado en 24 h sin segundos ("21/11/2026 07:00"), como el resto del sistema. */
export function fechaSimuladaReporte(value: string | null): string {
  const ms = parseBackendSimulatedTime(value);
  return Number.isFinite(ms) ? formatBackendSimulatedTime24(ms) : 'Sin planificación completada';
}

const formatoReal = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** Instante real (hora local) en 24 h sin segundos. */
export const fechaRealReporte = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? formatoReal.format(ms).replace(',', '') : '—';
};

/** Tiempo real de reproducción (desde que se vio el mapa) o, sin ese dato, el total del servidor. */
export const duracionRealVisible = (reporte: ReporteSimulacionDTO, inicioVisibleMs: number | null) =>
  inicioVisibleMs != null ? Math.max(0, Date.parse(reporte.finReal) - inicioVisibleMs) : reporte.duracionRealMs;

/** Filas del resumen (PDF). Sin duplicados: el motivo y la planificación estable van en su propia sección. */
export function resumenReporte(reporte: ReporteSimulacionDTO, inicioVisibleMs: number | null) {
  return [
    ['Escenario', escenariosReporte[reporte.tipoEscenario]],
    ['Motivo de finalización', motivosReporte[reporte.motivoFinalizacion]],
    ['Inicio simulado', fechaSimuladaReporte(reporte.inicioSimulado)],
    ['Fin simulado', fechaSimuladaReporte(reporte.finSimulado)],
    ['Tiempo simulado', duracionReporte(reporte.duracionSimuladaMs)],
    ['Tiempo real de operación', duracionReporte(duracionRealVisible(reporte, inicioVisibleMs))],
    ['Tiempo real con preparación', duracionReporte(reporte.duracionRealMs)],
    ['Inicio real', fechaRealReporte(reporte.inicioReal)],
    ['Fin real', fechaRealReporte(reporte.finReal)],
  ];
}
export function totalesReporte(reporte: ReporteSimulacionDTO) {
  return { recibidos: reporte.pedidosFinales.length,
    entregados: reporte.pedidosFinales.filter(p => p.estado === 'ENTREGADA').length,
    pendientes: reporte.pedidosFinales.filter(p => p.estado === 'PENDIENTE').length,
    incumplidos: reporte.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA').length };
}
