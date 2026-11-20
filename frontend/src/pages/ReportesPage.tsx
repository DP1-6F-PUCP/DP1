import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, BarChart3, CheckCircle2, Clock, Coins, FileDown, History, Hourglass, Info, MapPinned, PackageCheck, Truck,
  Warehouse as WarehouseIcon, Wrench,
} from 'lucide-react';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useReporteFinal } from '../hooks/useReporteFinal';
import { useMapStore } from '../store/mapStore';
import { useScenarioStore } from '../store/scenarioStore';
import { useUmbrales } from '../store/umbralesStore';
import { formatBackendSimulatedTime24, formatFechaHoraCorta, parseBackendSimulatedTime } from '../utils/backendTime';
import { getFleetFill, getWarehousesFill } from '../utils/indicadoresGlobales';
import { motivosReporte } from '../utils/simulationReport';
import { crearReportePdf } from '../services/simulationReportPdf';
import { GraficoTiempo, PuntoGrafico, SerieGrafico } from '../features/reportes/components/GraficoTiempo';
import { TarjetaKpi, TonoKpi } from '../features/reportes/components/TarjetaKpi';
import { TablaPlanificacion } from '../features/reportes/components/TablaPlanificacion';
import { Muestra, PASO_MUESTRA_MS, useMuestras } from '../features/reportes/historialStore';
import { tomarMuestra } from '../features/reportes/muestra';
import { CATEGORICA, SEMAFORO, SERIE } from '../features/reportes/paleta';
import { filasDesdeOperacion, filasDesdeReporte } from '../features/reportes/planificacionEstable';

const HORA = 3_600_000;
type Rango = 'h1' | 'h6' | 'h24' | 'todo';
const RANGOS: { clave: Rango; texto: string; ms: number | null }[] = [
  { clave: 'h1', texto: 'Última hora', ms: HORA },
  { clave: 'h6', texto: 'Últimas 6 h', ms: 6 * HORA },
  { clave: 'h24', texto: 'Últimas 24 h', ms: 24 * HORA },
  { clave: 'todo', texto: 'Todo', ms: null },
];

const entero = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: n >= 1000 ? 0 : 1 })}`;
const pct = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 0 });

/** Intervalo de las barras de flujo: ~12-48 barras según el rango. */
function intervaloFlujo(spanMs: number): number {
  if (spanMs <= HORA) return 5 * 60_000;
  if (spanMs <= 6 * HORA) return 30 * 60_000;
  return [1, 2, 3, 6, 12, 24].map((h) => h * HORA).find((ms) => spanMs / ms <= 48) ?? 24 * HORA;
}
const textoIntervalo = (ms: number) => (ms < HORA ? `${ms / 60_000} min` : ms === HORA ? 'hora' : `${ms / HORA} h`);

const SERIES_FLUJO: SerieGrafico[] = [
  { clave: 'recibidos', nombre: 'Recibidos', color: SERIE.recibidos },
  { clave: 'entregados', nombre: 'Entregados', color: SERIE.entregados },
];
const SERIES_BACKLOG: SerieGrafico[] = [
  { clave: 'conVehiculo', nombre: 'Con vehículo asignado', color: SERIE.conVehiculo },
  { clave: 'sinAsignar', nombre: 'Sin asignar', color: SERIE.sinAsignar },
];
const SERIES_FLOTA: SerieGrafico[] = [
  { clave: 'enRuta', nombre: 'En ruta (viaja, entrega o vuelve)', color: SERIE.enRuta },
  { clave: 'refrigerio', nombre: 'Refrigerio', color: SERIE.refrigerio },
  { clave: 'disponible', nombre: 'Disponible', color: SERIE.disponible },
  { clave: 'fueraServicio', nombre: 'Fuera de servicio', color: SERIE.fueraServicio },
];

const Chip: React.FC<{ activo: boolean; onClick: () => void; children: React.ReactNode }> = ({ activo, onClick, children }) => (
  <button type="button" aria-pressed={activo} onClick={onClick}
    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${activo
      ? 'border-cyan-600 bg-cyan-50 text-cyan-800 dark:border-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-200'
      : 'border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/70 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white'}`}>
    {children}
  </button>
);

/** Variación entre el primer valor del rango y el actual, con su lectura (subir es bueno o malo). */
function variacion(serie: (number | null)[], formato: (n: number) => string, subirEsBueno: boolean | null, sufijo = '') {
  const v = serie.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const d = v[v.length - 1] - v[0];
  if (Math.abs(d) < 1e-9) return null;
  return { texto: `${d > 0 ? '+' : '−'}${formato(Math.abs(d))}${sufijo} en el rango`, sube: d > 0, bueno: subirEsBueno == null ? null : (d > 0) === subirEsBueno };
}

/**
 * Reportes: lectura rápida de la operación al instante visible del mapa.
 *  1. KPIs con tendencia (sparkline) del rango elegido.
 *  2. Evolución: flujo de pedidos (barras por intervalo), backlog (área apilada), flota por estado
 *     (área apilada) y stock de almacenes (líneas con los cortes del semáforo).
 *  3. Planificación estable por pedido, descargable (CSV / texto / PDF).
 * El historial lo registra useRegistrarHistorial desde el layout (también con la página cerrada).
 */
export const ReportesPage: React.FC = () => {
  const navigate = useNavigate();
  const visual = useEstadoVisual();
  const u = useUmbrales(); // cortes de los semáforos (Configuración → Semáforos)
  const vivo = useEstadoOperacion();
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const inicioVisibleMs = useScenarioStore((s) => s.playbackStartedAtMs);
  const reporteFinal = useReporteFinal();
  const irAVehiculoDePedido = useMapStore((s) => s.irAVehiculoDePedido);
  const centrarEn = useMapStore((s) => s.centrarEn);
  const muestras = useMuestras(ejecucion?.idEjecucion);

  const [params, setParams] = useSearchParams();
  const rangoParam = params.get('rango') as Rango | null;
  const rango = RANGOS.find((r) => r.clave === rangoParam) ?? RANGOS[1];
  const setRango = (r: Rango) => setParams((p) => {
    const s = new URLSearchParams(p);
    if (r === 'h6') s.delete('rango'); else s.set('rango', r);
    return s;
  }, { replace: true });

  const ahora = visual.marcaVisibleMs;
  const actual = useMemo(() => tomarMuestra(visual), [visual]);

  // Muestras del rango + el instante actual al final (los gráficos terminan "ahora").
  const inicioTodo = scenarioStartMs ?? muestras[0]?.t ?? ahora ?? 0;
  const desde = ahora == null ? 0 : rango.ms == null ? inicioTodo : Math.max(inicioTodo, ahora - rango.ms);
  const enRango = useMemo(() => {
    const lista: Muestra[] = muestras.filter((m) => m.t >= desde && (ahora == null || m.t <= ahora));
    if (actual && (!lista.length || actual.t - lista[lista.length - 1].t > 1000)) lista.push(actual);
    return lista;
  }, [muestras, desde, ahora, actual]);
  const historialDesde = muestras[0]?.t;
  const historialTardio = historialDesde != null && historialDesde > desde + 2 * PASO_MUESTRA_MS;

  // Flujo de pedidos: se reconstruye de los propios pedidos (llegada / entrega), así está completo
  // aunque la página o el historial empiecen tarde.
  const flujo = useMemo(() => {
    if (ahora == null) return { puntos: [] as PuntoGrafico[], intervalo: HORA };
    const intervalo = intervaloFlujo(ahora - desde);
    const inicio = Math.floor(desde / intervalo) * intervalo;
    const n = Math.max(1, Math.ceil((ahora - inicio) / intervalo));
    const rec = new Array<number>(n).fill(0);
    const ent = new Array<number>(n).fill(0);
    for (const o of visual.orders) {
      if (o.arrivalSimMs != null && o.arrivalSimMs >= inicio && o.arrivalSimMs <= ahora) rec[Math.min(n - 1, Math.floor((o.arrivalSimMs - inicio) / intervalo))] += 1;
      if (o.status === 'delivered' && o.deliveredSimMs != null && o.deliveredSimMs >= inicio && o.deliveredSimMs <= ahora) {
        ent[Math.min(n - 1, Math.floor((o.deliveredSimMs - inicio) / intervalo))] += 1;
      }
    }
    return { intervalo, puntos: rec.map((r, i) => ({ t: inicio + i * intervalo, valores: { recibidos: r, entregados: ent[i] } })) };
  }, [visual.orders, desde, ahora]);

  const puntosBacklog = useMemo(() => enRango.map((m) => ({ t: m.t, valores: { conVehiculo: m.pendientes - m.sinAsignar, sinAsignar: m.sinAsignar } })), [enRango]);
  const puntosFlota = useMemo(() => enRango.map((m) => ({ t: m.t, valores: { ...m.flota } })), [enRango]);
  // Almacenes: una línea por almacén con capacidad (el central es ilimitado). Orden por nombre:
  // cada almacén conserva su color aunque cambie el rango.
  const seriesAlmacenes = useMemo<SerieGrafico[]>(() => {
    const nombres = new Set<string>();
    for (const m of enRango) for (const k of Object.keys(m.almacenes)) nombres.add(k);
    return [...nombres].sort((a, b) => a.localeCompare(b)).slice(0, CATEGORICA.length)
      .map((n, i) => ({ clave: n, nombre: n, color: CATEGORICA[i] }));
  }, [enRango]);
  const puntosAlmacenes = useMemo(() => enRango.map((m) => ({ t: m.t, valores: { ...m.almacenes } })), [enRango]);

  // Planificación estable: en curso, el último lote RECIBIDO (vivo, por delante del mapa); al
  // terminar, la última planificación estable del reporte final.
  const reporte = reporteFinal.data;
  const plan = useMemo(() => {
    if (reporteFinal.abierto && reporte) {
      const estable = reporte.ultimaPlanificacionEstable;
      const corte = estable ? parseBackendSimulatedTime(estable.marcaTiempoActual) : null;
      return {
        filas: estable ? filasDesdeReporte(estable.rutas, reporte.pedidosPlanificacionEstable, corte) : [],
        corteMs: corte != null && Number.isFinite(corte) ? corte : null,
        origen: estable ? 'Último lote estable (reporte final)' : 'No hubo una planificación estable completada',
      };
    }
    const raw = vivo.estadoRaw;
    const corte = raw?.marcaTiempoActual ? parseBackendSimulatedTime(raw.marcaTiempoActual) : null;
    return {
      filas: raw ? filasDesdeOperacion(raw.rutas, vivo.orders) : [],
      corteMs: corte != null && Number.isFinite(corte) ? corte : null,
      origen: 'Último lote recibido',
    };
  }, [reporteFinal.abierto, reporte, vivo.estadoRaw, vivo.orders]);

  const verVehiculo = (idVehiculo: string, idPedido: string) => {
    const v = visual.vehicles.find((x) => x.id === idVehiculo || x.code === idVehiculo);
    if (!v) return;
    irAVehiculoDePedido(v.id, idPedido);
    centrarEn(v.position.x, v.position.y);
    navigate('/');
  };

  if (!ejecucion || ahora == null || !actual) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-background)] p-6 text-slate-900 dark:text-slate-100">
        <div className="max-w-sm rounded-xl border border-dashed border-slate-300 bg-[var(--color-surface)] p-8 text-center dark:border-slate-700">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 text-slate-400 dark:text-slate-600" aria-hidden />
          <p className="font-medium">Aún no hay datos para reportar</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Los reportes aparecen cuando llega el primer lote de la ejecución.</p>
        </div>
      </div>
    );
  }

  // ── KPIs ──
  const serie = (f: (m: Muestra) => number | null) => enRango.map(f);
  const flota = getFleetFill(visual.vehicles);
  const almacenes = getWarehousesFill(visual.warehouses);
  const tonoOtd: TonoKpi = actual.otd == null ? 'neutro' : actual.otd >= 99.95 ? 'bien' : 'critico';
  const tonoPend: TonoKpi = actual.retrasados > 0 ? 'critico' : actual.sinAsignar > 0 && (variacion(serie((m) => m.sinAsignar), entero, false)?.sube ?? false) ? 'atencion' : 'neutro';
  const tonoFlota: TonoKpi = flota.level === 'saturated' ? 'critico' : flota.level === 'high' ? 'atencion' : 'bien';
  const tonoAlm: TonoKpi = almacenes.total === 0 ? 'neutro' : almacenes.level === 'high' ? 'bien' : almacenes.level === 'medium' ? 'atencion' : 'critico';
  const porEntrega = actual.entregados > 0 ? actual.costo / actual.entregados : null;
  const fuera = actual.flota.fueraServicio;

  const finalizada = reporteFinal.abierto;
  const finSimulado = reporte ? parseBackendSimulatedTime(reporte.finSimulado) : NaN;

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--color-background)] px-6 py-5 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Cabecera: título, hora visible y rango */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <BarChart3 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" aria-hidden />Reportes
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Indicadores y evolución de la operación, al instante que muestra el mapa</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[var(--color-surface)] px-2.5 py-1 text-sm text-slate-700 dark:border-slate-700/70 dark:text-slate-300"
              title="Hora visible del mapa: todos los indicadores se calculan a este instante">
              <Clock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden />Hora simulación
              <span className="font-mono-code font-semibold text-slate-900 dark:text-slate-100">{formatBackendSimulatedTime24(ahora)}</span>
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-label="Rango de tiempo">
              {RANGOS.map((r) => <Chip key={r.clave} activo={rango.clave === r.clave} onClick={() => setRango(r.clave)}>{r.texto}</Chip>)}
            </div>
          </div>
        </div>

        {finalizada && (
          <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${reporte?.motivoFinalizacion === 'COLAPSO'
            ? 'border-rose-500/60 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200'
            : 'border-blue-500/50 bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-200'}`}>
            <p className="flex items-center gap-2">
              {reporte?.motivoFinalizacion === 'COLAPSO' ? <AlertOctagon className="h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />}
              <span>
                <span className="font-semibold">Ejecución terminada</span>
                {reporte ? <> · {motivosReporte[reporte.motivoFinalizacion]} · fin simulado <span className="font-mono-code font-semibold">{Number.isFinite(finSimulado) ? formatBackendSimulatedTime24(finSimulado) : '—'}</span></> : ' · cargando el reporte final…'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!reporte}
                onClick={() => { if (reporte) crearReportePdf(reporte, inicioVisibleMs).save(`reporte-simulacion-${reporte.idEjecucion}.pdf`); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/40 disabled:opacity-50 dark:hover:bg-white/10">
                <FileDown className="h-3.5 w-3.5" aria-hidden />Reporte final (PDF)
              </button>
              <button type="button" onClick={() => navigate('/')}
                title="En Operación, el aviso de cierre tiene el botón «Reporte» con el detalle completo"
                className="inline-flex items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/40 dark:hover:bg-white/10">
                <MapPinned className="h-3.5 w-3.5" aria-hidden />Ver reporte en Operación
              </button>
            </div>
          </div>
        )}

        {historialTardio && (
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-[var(--color-surface)] px-3 py-2 text-xs text-slate-600 dark:border-slate-700/70 dark:text-slate-400">
            <History className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Historial registrado <span className="font-semibold text-slate-800 dark:text-slate-200">desde {formatFechaHoraCorta(historialDesde)}</span>:
              se toma mientras la aplicación está abierta (una muestra cada {PASO_MUESTRA_MS / 60_000} min simulados) y se pierde al recargar.
              El flujo de pedidos sí está completo: sale de las fechas de cada pedido.
            </span>
          </p>
        )}

        {/* 1. KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaKpi icono={CheckCircle2} titulo="Entregas a tiempo (OTD)" tono={tonoOtd}
            estado={tonoOtd === 'bien' ? 'Meta' : tonoOtd === 'critico' ? 'Bajo meta' : undefined}
            valor={actual.otd == null ? '—' : `${actual.otd.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`}
            detalle={actual.otd == null ? 'Aún no hay pedidos resueltos' : 'Entregados / (entregados + incumplidos)'}
            serie={serie((m) => m.otd)} delta={variacion(serie((m) => m.otd), (n) => n.toFixed(1), true, ' pp')}
            ayuda="Porcentaje de entregas a tiempo según el servidor. Meta 100 %: un incumplido detiene la operación." />
          <TarjetaKpi icono={PackageCheck} titulo="Entregados"
            valor={entero(actual.entregados)}
            detalle={`de ${entero(actual.recibidos)} recibidos${actual.recibidos ? ` · ${pct((actual.entregados / actual.recibidos) * 100)} %` : ''}`}
            serie={serie((m) => m.entregados)} delta={variacion(serie((m) => m.entregados), entero, true)}
            ayuda="Pedidos entregados al instante visible, de todos los recibidos hasta ahora." />
          <TarjetaKpi icono={Hourglass} titulo="Pendientes" tono={tonoPend}
            estado={actual.retrasados > 0 ? `${actual.retrasados} retrasados` : tonoPend === 'atencion' ? 'Sin asignar sube' : undefined}
            valor={entero(actual.pendientes)}
            detalle={`${entero(actual.sinAsignar)} sin asignar · ${entero(actual.pendientes - actual.sinAsignar)} con vehículo`}
            serie={serie((m) => m.pendientes)} delta={variacion(serie((m) => m.pendientes), entero, false)}
            ayuda="Pedidos recibidos aún no entregados; sin asignar = sin vehículo en ninguna ruta." />
          <TarjetaKpi icono={AlertOctagon} titulo="Incumplidos" tono={actual.incumplidos > 0 ? 'critico' : 'bien'}
            estado={actual.incumplidos > 0 ? 'Colapso' : 'Ninguno'}
            valor={entero(actual.incumplidos)}
            detalle={actual.incumplidos > 0 ? 'La operación se detiene' : 'Ningún pedido fuera de plazo'}
            ayuda="Pedidos que el servidor marcó INCUMPLIDA (fuera de plazo). Uno basta para el colapso." />
          <TarjetaKpi icono={Coins} titulo="Costo acumulado"
            valor={soles(actual.costo)}
            detalle={porEntrega == null ? 'Sin entregas aún' : `${soles(porEntrega)} por entrega`}
            serie={serie((m) => m.costo)} delta={variacion(serie((m) => m.costo), soles, null)}
            ayuda="Costo total acumulado de las rutas (servidor) y su promedio por pedido entregado." />
          <TarjetaKpi icono={Truck} titulo="Llenado de flota (G01/G02)" tono={tonoFlota} estado={flota.label}
            valor={`${flota.pct} %`}
            detalle={`${entero(flota.load)} de ${entero(flota.capacity)} paquetes a bordo`}
            serie={serie((m) => m.flotaPct)} delta={variacion(serie((m) => m.flotaPct), pct, null, ' pp')}
            ayuda={`Carga a bordo sobre capacidad total de la flota. Verde < ${u.flotaAlta} %, ámbar ${u.flotaAlta}-${u.flotaSaturada - 1} %, rojo ≥ ${u.flotaSaturada} % (saturada).`} />
          <TarjetaKpi icono={WarehouseIcon} titulo="Llenado de almacenes (G04)" tono={tonoAlm} estado={almacenes.total ? almacenes.label : undefined}
            valor={almacenes.total ? `${almacenes.pct} %` : '∞'}
            detalle={almacenes.total ? `${entero(almacenes.stock)} de ${entero(almacenes.capacity)} · ${almacenes.total} intermedios` : 'Solo el central (ilimitado)'}
            serie={serie((m) => m.almacenesPct)} delta={variacion(serie((m) => m.almacenesPct), pct, true, ' pp')}
            ayuda={`Stock de los almacenes intermedios sobre su capacidad. Verde ≥ ${u.almacenAlto} %, ámbar ≥ ${u.almacenBajo} %, rojo < ${u.almacenBajo} %.`} />
          <TarjetaKpi icono={Wrench} titulo="Averías" tono={fuera > 0 ? 'atencion' : 'neutro'}
            estado={fuera > 0 ? `${fuera} fuera de servicio` : undefined}
            valor={entero(actual.averias)}
            detalle={`${actual.flota.disponible} disponibles de ${visual.vehicles.length} vehículos`}
            serie={serie((m) => m.averias)} delta={variacion(serie((m) => m.averias), entero, false)}
            ayuda="Averías registradas en la ejecución (servidor) y vehículos fuera de servicio ahora." />
        </div>

        {/* 2. Evolución */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <GraficoTiempo titulo="Pedidos recibidos vs. entregados"
            subtitulo={<>Por {textoIntervalo(flujo.intervalo)} · si las barras aqua superan a las azules, el backlog crece{(visual.ordersOmitted ?? 0) > 0 ? ' · sin los entregados más antiguos (no retenidos)' : ''}</>}
            tipo="barras" anchoMs={flujo.intervalo} series={SERIES_FLUJO} puntos={flujo.puntos}
            vacio="Aún no llegan pedidos en este rango." />
          <GraficoTiempo titulo="Backlog: pedidos pendientes"
            subtitulo="Pendientes al instante, con y sin vehículo asignado (apilado = total)"
            tipo="apilado" series={SERIES_BACKLOG} puntos={puntosBacklog}
            vacio="Se necesitan al menos dos muestras: deja la operación correr unos minutos." />
          <GraficoTiempo titulo="Uso de la flota por estado"
            subtitulo={`Vehículos en cada estado (apilado = flota de ${visual.vehicles.length})`}
            tipo="apilado" series={SERIES_FLOTA} puntos={puntosFlota}
            vacio="Se necesitan al menos dos muestras: deja la operación correr unos minutos." />
          <GraficoTiempo titulo="Stock de almacenes intermedios"
            subtitulo={`% de la capacidad de cada almacén · líneas punteadas: cortes del semáforo (${u.almacenBajo} % y ${u.almacenAlto} %)`}
            tipo="lineas" series={seriesAlmacenes} puntos={puntosAlmacenes} yMax={100} unidad=" %" formato={pct}
            umbrales={[{ valor: u.almacenAlto, etiqueta: `Abastecido ≥ ${u.almacenAlto} %`, color: SEMAFORO.bien }, { valor: u.almacenBajo, etiqueta: `Por agotarse < ${u.almacenBajo} %`, color: SEMAFORO.critico }]}
            vacio={seriesAlmacenes.length ? 'Se necesitan al menos dos muestras.' : 'No hay almacenes con capacidad limitada (el central es ilimitado).'} />
        </div>

        {/* 3. Planificación estable */}
        <TablaPlanificacion filas={plan.filas} corteMs={plan.corteMs} origen={plan.origen}
          onVerVehiculo={finalizada ? undefined : verVehiculo} />

        <p className="flex items-start gap-1.5 pb-2 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Contadores de pedidos y flota: al instante del mapa. OTD, costo, averías e incumplidos: los del servidor para el lote que se reproduce.
          La planificación estable es el último plan recibido (va por delante del mapa).
        </p>
      </div>
    </div>
  );
};
