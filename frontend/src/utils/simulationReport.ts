import type { ReporteSimulacionDTO } from '../types/backend';
import { formatBackendSimulatedTime, parseBackendSimulatedTime } from './backendTime';

export const motivosReporte = { COLAPSO: 'Colapso por incumplimiento', PARADA_MANUAL: 'Detenida con el botón Parar',
  PERIODO_COMPLETADO: 'Periodo de simulación completado' };
export const escenariosReporte = { DIA_A_DIA: 'Día a día', CINCO_DIAS: 'Simulación de 5 días', COLAPSO_LOGISTICO: 'Colapso logístico' };
export function duracionReporte(ms: number): string {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(segundos / 86400)}d ${String(Math.floor(segundos / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(segundos / 60) % 60).padStart(2, '0')}min ${String(segundos % 60).padStart(2, '0')}s`;
}
export function fechaSimuladaReporte(value: string | null): string {
  const ms = parseBackendSimulatedTime(value);
  return Number.isFinite(ms) ? formatBackendSimulatedTime(ms, true, true) : 'Sin planificación completada';
}
export function resumenReporte(reporte: ReporteSimulacionDTO, inicioVisibleMs: number | null) {
  return [
    ['Escenario', escenariosReporte[reporte.tipoEscenario]],
    ['Motivo de finalización', motivosReporte[reporte.motivoFinalizacion]],
    ['Inicio simulado', fechaSimuladaReporte(reporte.inicioSimulado)],
    ['Fin simulado', fechaSimuladaReporte(reporte.finSimulado)],
    ['Tiempo simulado', duracionReporte(reporte.duracionSimuladaMs)],
    ['Tiempo transcurrido real', duracionReporte(inicioVisibleMs != null
      ? Math.max(0, Date.parse(reporte.finReal) - inicioVisibleMs) : reporte.duracionRealMs)],
    ['Duración total, incluida preparación', duracionReporte(reporte.duracionRealMs)],
    ['Inicio real', new Date(reporte.inicioReal).toLocaleString('es-PE')],
    ['Fin real', new Date(reporte.finReal).toLocaleString('es-PE')],
    ['Última planificación estable', fechaSimuladaReporte(reporte.ultimaPlanificacionEstable?.marcaTiempoActual ?? null)],
  ];
}
export function totalesReporte(reporte: ReporteSimulacionDTO) {
  return { recibidos: reporte.pedidosFinales.length,
    entregados: reporte.pedidosFinales.filter(p => p.estado === 'ENTREGADA').length,
    pendientes: reporte.pedidosFinales.filter(p => p.estado === 'PENDIENTE').length,
    incumplidos: reporte.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA').length };
}
