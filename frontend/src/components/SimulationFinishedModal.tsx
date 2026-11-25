import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, CheckCircle2, Coins, Download, Hourglass, Loader2, LogOut, OctagonX, PackageCheck, Square, Wrench, X } from 'lucide-react';
import type { ReporteSimulacionDTO } from '../types/backend';
import {
  duracionRealVisible, duracionReporte, escenariosReporte, fechaSimuladaReporte, motivosReporte, totalesReporte,
} from '../utils/simulationReport';
import { formatFechaHoraCorta, parseBackendSimulatedTime } from '../utils/backendTime';
import { duracionCorta } from '../utils/estadoPedidos';
import { ESTADO_RUTA } from '../features/reportes/planificacionEstable';
import { crearReportePdf } from '../services/simulationReportPdf';

interface Props {
  isOpen: boolean;
  /** "Salir": termina y vuelve al inicio (la reconfirmación la hace quien lo pasa). */
  onAccept: () => void;
  /** "×" (y Esc): oculta el reporte y deja el mapa final a la vista. Sin él no hay "×". */
  onClose?: () => void;
  reporte: ReporteSimulacionDTO | undefined;
  inicioVisibleMs: number | null;
  isError: boolean;
  onRetry: () => void;
}

// Claro y oscuro con `dark:` (antes los colores eran fijos y el modal se veía oscuro en tema claro).
const TENUE = 'text-slate-500 dark:text-slate-400';

/** Color e ícono del motivo: verde fin normal, rojo colapso, gris detenida por el operador. */
const MOTIVO = {
  PERIODO_COMPLETADO: { Icono: CheckCircle2, caja: 'border-emerald-500/70 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', borde: 'border-emerald-500/60' },
  COLAPSO: { Icono: AlertOctagon, caja: 'border-rose-500/80 bg-rose-500/10 text-rose-600 dark:text-rose-400', borde: 'border-rose-500' },
  PARADA_MANUAL: { Icono: Square, caja: 'border-slate-400/70 bg-slate-500/10 text-slate-600 dark:text-slate-300', borde: 'border-slate-300 dark:border-slate-600' },
  // El backend se apagó con la simulación en curso (apagado ordenado): reporte parcial.
  REINICIO_SERVIDOR: { Icono: OctagonX, caja: 'border-amber-500/70 bg-amber-500/10 text-amber-600 dark:text-amber-400', borde: 'border-amber-500/60' },
} as const;

type Tono = 'bien' | 'mal' | 'neutro';
const TONO_KPI: Record<Tono, string> = {
  bien: 'border-emerald-500/50',
  mal: 'border-rose-500/70',
  neutro: 'border-slate-200 dark:border-slate-700/70',
};
const COLOR_VALOR: Record<Tono, string> = {
  bien: 'text-emerald-700 dark:text-emerald-300',
  mal: 'text-rose-700 dark:text-rose-300',
  neutro: 'text-slate-900 dark:text-slate-50',
};

const Kpi: React.FC<{ Icono: React.ElementType; titulo: string; valor: React.ReactNode; detalle?: string; tono?: Tono }> = ({ Icono, titulo, valor, detalle, tono = 'neutro' }) => (
  <div className={`min-w-0 rounded-lg border bg-white p-2.5 dark:bg-[#141a27] ${TONO_KPI[tono]}`}>
    <p className={`flex items-center gap-1 text-[11px] font-medium ${TENUE}`}><Icono className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{titulo}</span></p>
    <p className={`mt-0.5 truncate whitespace-nowrap font-mono-code text-base font-semibold leading-tight ${COLOR_VALOR[tono]}`}>{valor}</p>
    {detalle && <p className={`truncate text-[11px] ${TENUE}`}>{detalle}</p>}
  </div>
);

const ESTADO_PEDIDO_REPORTE = {
  INCUMPLIDA: { label: 'Incumplido', clase: 'text-rose-700 dark:text-rose-300', orden: 0 },
  PENDIENTE: { label: 'Pendiente', clase: 'text-amber-700 dark:text-amber-300', orden: 1 },
  ENTREGADA: { label: 'Entregado', clase: 'text-emerald-700 dark:text-emerald-300', orden: 2 },
} as const;
/** Filas por tanda: un colapso largo trae miles de pedidos. */
const FILAS_PEDIDOS = 100;
const hora = (iso: string | null | undefined) => {
  const ms = parseBackendSimulatedTime(iso ?? null);
  return Number.isFinite(ms) ? formatFechaHoraCorta(ms) : '—';
};

/**
 * Detalle del reporte: los pedidos de la simulación y la última planificación estable (requisito del
 * curso). Si ese plan ya no tiene pedidos (todo se entregó), abre en Pedidos: antes solo estaba el plan
 * y una simulación perfecta mostraba una tabla vacía.
 */
const DetalleReporte: React.FC<{ reporte: ReporteSimulacionDTO }> = ({ reporte }) => {
  const rutas = useMemo(
    () => reporte.ultimaPlanificacionEstable?.rutas.filter((r) => r.secuenciaEntrega.length > 0) ?? [],
    [reporte],
  );
  const pedidos = useMemo(() => [...reporte.pedidosFinales].sort((a, b) =>
    ESTADO_PEDIDO_REPORTE[a.estado].orden - ESTADO_PEDIDO_REPORTE[b.estado].orden
    || parseBackendSimulatedTime(a.fechaLimite) - parseBackendSimulatedTime(b.fechaLimite)), [reporte]);
  const [vista, setVista] = useState<'plan' | 'pedidos'>(rutas.length > 0 ? 'plan' : 'pedidos');
  const [tope, setTope] = useState(FILAS_PEDIDOS);
  const pestana = (id: typeof vista, texto: string, n: number) => (
    <button type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${vista === id
        ? 'bg-blue-600 text-white' : `${TENUE} hover:bg-slate-200 dark:hover:bg-slate-800`}`}>
      {texto} <span className="font-mono-code text-xs font-normal">{n.toLocaleString('es-PE')}</span>
    </button>
  );
  const cabecera = `bg-slate-100 dark:bg-slate-900 ${TENUE}`;
  const fila = 'border-t border-slate-200 dark:border-slate-700/60';
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Detalle del reporte">
        {pestana('pedidos', 'Pedidos', pedidos.length)}
        {pestana('plan', 'Plan estable', rutas.length)}
        {vista === 'plan' && (
          <span className={`font-mono-code text-xs ${TENUE}`} title="Última planificación estable">
            {fechaSimuladaReporte(reporte.ultimaPlanificacionEstable?.marcaTiempoActual ?? null)}
          </span>
        )}
      </div>
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/70">
        {vista === 'plan' ? (
          rutas.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead className={cabecera}><tr><th className="px-2 py-1.5">Unidad</th><th className="px-2">Ruta</th><th className="px-2">Pedidos</th></tr></thead>
              <tbody>{rutas.map((r) => (
                <tr key={r.idRuta} className={fila}>
                  <td className="px-2 py-1.5 font-mono-code font-semibold">{r.vehiculoId}</td>
                  <td className="px-2">{ESTADO_RUTA[r.estado] ?? r.estado}</td>
                  <td className="px-2 font-mono-code">{r.secuenciaEntrega.join(', ')}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <p className={`p-2 text-xs ${TENUE}`}>{!reporte.ultimaPlanificacionEstable ? 'No hubo un plan estable.'
              : pedidos.some((p) => p.estado !== 'ENTREGADA') ? 'Sin rutas con pedidos en el último plan estable.'
                : 'Todo se entregó: no quedaban pedidos por planificar.'}</p>
          )
        ) : pedidos.length > 0 ? (
          <>
            <table className="w-full text-left text-xs">
              <thead className={cabecera}><tr>
                <th className="px-2 py-1.5">Pedido</th><th className="px-2">Cliente</th><th className="px-2">Estado</th>
                <th className="px-2 text-right">Paq.</th><th className="px-2">Límite</th><th className="px-2">Entrega</th>
                <th className="px-2" title="Tiempo que sobró hasta el límite">Margen</th>
              </tr></thead>
              <tbody>{pedidos.slice(0, tope).map((p) => {
                const e = ESTADO_PEDIDO_REPORTE[p.estado];
                const margen = parseBackendSimulatedTime(p.fechaLimite) - parseBackendSimulatedTime(p.fechaEntrega ?? null);
                return (
                  <tr key={p.idPedido} className={fila}>
                    <td className="px-2 py-1.5 font-mono-code font-semibold">{p.idPedido}</td>
                    <td className="px-2 font-mono-code">{p.idCliente}</td>
                    <td className={`px-2 font-semibold ${e.clase}`}>{e.label}</td>
                    <td className="px-2 text-right font-mono-code">{p.cantidadSolicitada}</td>
                    <td className="whitespace-nowrap px-2 font-mono-code">{hora(p.fechaLimite)}</td>
                    <td className="whitespace-nowrap px-2 font-mono-code">{hora(p.fechaEntrega)}</td>
                    <td className="whitespace-nowrap px-2 font-mono-code">{Number.isFinite(margen) ? duracionCorta(margen) : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            {pedidos.length > tope && (
              <button type="button" onClick={() => setTope((n) => n + FILAS_PEDIDOS)}
                className={`w-full border-t border-slate-200 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700/60 dark:hover:bg-slate-800 ${TENUE}`}>
                Ver más <span className="font-mono-code">+{(pedidos.length - tope).toLocaleString('es-PE')}</span>
              </button>
            )}
          </>
        ) : <p className={`p-2 text-xs ${TENUE}`}>No llegaron pedidos.</p>}
      </div>
    </>
  );
};

export const SimulationFinishedModal: React.FC<Props> = ({ isOpen, onAccept, onClose, reporte, inicioVisibleMs, isError, onRetry }) => {
  const salirRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    salirRef.current?.focus();
    if (!onClose) return;
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const motivo = MOTIVO[reporte?.motivoFinalizacion ?? 'PARADA_MANUAL'];
  const totales = reporte ? totalesReporte(reporte) : null;
  const metricas = reporte?.estadoFinal?.metricas;
  const incumplidos = reporte?.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA') ?? [];
  const otd = metricas?.porcentajeEntregasATiempo;

  return (
    // Modal: no se cierra con clic fuera (solo «×», Esc o los botones).
    <div role="dialog" aria-modal="true" aria-labelledby="simulation-report-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <div className={`relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-[var(--color-background)] p-4 text-slate-900 shadow-2xl dark:bg-[#121722] dark:text-slate-100 ${motivo.borde}`}>
        {onClose && (
          <button type="button" aria-label="Ver el mapa final" title="Ver el mapa final (el reporte sigue disponible)"
            onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        )}

        {/* Encabezado: motivo con su color, escenario y una línea de tiempos. */}
        <div className="mb-3 flex items-center gap-3 pr-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 ${motivo.caja}`}>
            <motivo.Icono className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="simulation-report-title" className="text-lg font-bold">{reporte ? motivosReporte[reporte.motivoFinalizacion] : 'Simulación finalizada'}</h2>
            {reporte ? (
              <p className={`text-xs ${TENUE}`}>
                {escenariosReporte[reporte.tipoEscenario]} ·{' '}
                <span className="font-mono-code" title="Inicio → fin simulados">
                  {formatFechaHoraCorta(parseBackendSimulatedTime(reporte.inicioSimulado))} → {formatFechaHoraCorta(parseBackendSimulatedTime(reporte.finSimulado))}
                </span>
                {' '}· {duracionReporte(reporte.duracionSimuladaMs)} · <span title="Tiempo real de operación">real {duracionReporte(duracionRealVisible(reporte, inicioVisibleMs))}</span>
              </p>
            ) : <p className={`text-xs ${TENUE}`}>Preparando el reporte…</p>}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {!reporte && (isError
            ? <div role="alert" className="p-4 text-sm text-slate-700 dark:text-slate-300">No se pudo cargar el reporte.
                <button type="button" onClick={onRetry} className="mt-3 block font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">Reintentar</button></div>
            : <div role="status" className={`flex items-center gap-2 p-4 text-sm ${TENUE}`}><Loader2 className="h-4 w-4 animate-spin" />Cargando resultados…</div>)}
          {reporte && totales && <>
            {/* Franja de KPI: lo que importa primero, con ícono y color de estado. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              <Kpi Icono={CheckCircle2} titulo="A tiempo" tono={otd == null ? 'neutro' : otd >= 99.95 ? 'bien' : 'mal'}
                valor={otd == null ? '—' : `${otd.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`} />
              <Kpi Icono={PackageCheck} titulo="Entregados" valor={totales.entregados.toLocaleString('es-PE')}
                detalle={`de ${totales.recibidos.toLocaleString('es-PE')} recibidos`} />
              <Kpi Icono={Hourglass} titulo="Pendientes" valor={totales.pendientes.toLocaleString('es-PE')} />
              <Kpi Icono={OctagonX} titulo="Incumplidos" tono={totales.incumplidos > 0 ? 'mal' : 'bien'} valor={totales.incumplidos} />
              <Kpi Icono={Coins} titulo="Costo" valor={metricas ? `S/ ${Math.round(metricas.costoTotalAcumulado).toLocaleString('es-PE')}` : '—'} />
              <Kpi Icono={Wrench} titulo="Averías" valor={metricas?.contadorAverias ?? '—'} />
            </div>

            {incumplidos.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                {incumplidos.map(p => (
                  <li key={p.idPedido} className="flex flex-wrap gap-x-2">
                    <span className="font-mono-code font-semibold">{p.idPedido}</span>
                    <span>cliente {p.idCliente}</span>
                    <span className="font-mono-code">({p.posX}, {p.posY})</span>
                    <span>límite <span className="font-mono-code">{formatFechaHoraCorta(parseBackendSimulatedTime(p.fechaLimite))}</span></span>
                  </li>
                ))}
              </ul>
            )}

            <DetalleReporte key={reporte.idEjecucion} reporte={reporte} />
            <p className={`mt-1 text-[11px] ${TENUE}`}>El PDF trae además el detalle de tiempos, flota, almacenes y pendientes.</p>
          </>}
        </div>

        {/* Secundario a la izquierda, primario a la derecha; una palabra por botón (como el aviso de cierre: Reporte / Salir). */}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!reporte} title="Descargar el reporte en PDF"
            onClick={() => { if (reporte) crearReportePdf(reporte, inicioVisibleMs).save(`reporte-simulacion-${reporte.idEjecucion}.pdf`); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-transparent dark:text-white dark:hover:bg-slate-800"><Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />PDF</button>
          <button ref={salirRef} type="button" onClick={onAccept} title="Terminar y volver al inicio"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"><LogOut className="h-4 w-4" />Salir</button>
        </div>
      </div>
    </div>
  );
};
