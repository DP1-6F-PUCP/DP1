import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Play, Route as RouteIcon, Truck, Navigation, MapPin, PackageOpen, PackageCheck,
  Coffee, Warehouse, Construction, Wrench, PackagePlus, RefreshCw, Camera, AlertTriangle, Flag,
  LocateFixed, X,
} from 'lucide-react';
import { useEstadoVisual } from '../../../engine/useEstadoVisual';
import { useMapStore } from '../../../store/mapStore';
import type { EventoDTO } from '../../../types/backend';
import { formatFechaHoraCorta, parseBackendSimulatedTime } from '../../../utils/backendTime';

const ICONO_POR_TIPO: Record<string, React.ElementType> = {
  INICIO_SIMULACION: Play,
  PLANIFICACION_RUTAS: RouteIcon,
  DESPACHO_VEHICULO: Truck,
  MOVIMIENTO_TRAMO: Navigation,
  LLEGADA_A_DESTINO: MapPin,
  INICIO_SERVICIO: PackageOpen,
  FIN_SERVICIO_ENTREGA: PackageCheck,
  INICIO_REFRIGERIO: Coffee,
  FIN_REFRIGERIO: Coffee,
  RETORNO_ALMACEN: Warehouse,
  LLEGADA_ALMACEN: Warehouse,
  INCIDENCIA_BLOQUEO: Construction,
  INCIDENCIA_AVERIA_VEHICULO: Wrench,
  INCIDENCIA_NUEVO_PEDIDO: PackagePlus,
  REPLANIFICACION_RUTAS: RefreshCw,
  INICIO_TRASVASE: PackageOpen,
  FIN_TRASVASE: PackageCheck,
  SNAPSHOT_ESTADO: Camera,
  PEDIDO_EN_RIESGO_SLA: AlertTriangle,
  FIN_SIMULACION: Flag,
};

const LABEL_POR_TIPO: Record<string, string> = {
  INICIO_SIMULACION: 'Inicio de simulación',
  PLANIFICACION_RUTAS: 'Planificación de rutas',
  DESPACHO_VEHICULO: 'Despacho',
  MOVIMIENTO_TRAMO: 'Movimiento de tramo',
  LLEGADA_A_DESTINO: 'Llegada a destino',
  INICIO_SERVICIO: 'Inicio de entrega',
  FIN_SERVICIO_ENTREGA: 'Entrega completada',
  INICIO_REFRIGERIO: 'Inicio de refrigerio',
  FIN_REFRIGERIO: 'Fin de refrigerio',
  RETORNO_ALMACEN: 'Retorno a almacén',
  LLEGADA_ALMACEN: 'Llegada a almacén',
  INCIDENCIA_BLOQUEO: 'Bloqueo de calle',
  INCIDENCIA_AVERIA_VEHICULO: 'Avería',
  INCIDENCIA_NUEVO_PEDIDO: 'Nuevo pedido',
  REPLANIFICACION_RUTAS: 'Replanificación',
  INICIO_TRASVASE: 'Inicio de trasvase',
  FIN_TRASVASE: 'Trasvase completado',
  SNAPSHOT_ESTADO: 'Snapshot de estado',
  PEDIDO_EN_RIESGO_SLA: 'Pedido en riesgo',
  FIN_SIMULACION: 'Fin de simulación',
};

/**
 * Grupos de filtro. Los 20 TipoEvento del backend (ver ICONO_POR_TIPO) se reparten en 5 grupos;
 * MOVIMIENTO_TRAMO (~85 % de la bitácora: un evento por cuadra recorrida) va aparte y oculto por defecto.
 */
type Grupo = 'averias' | 'entregas' | 'rutas' | 'alertas' | 'otros';
const GRUPO_POR_TIPO: Record<string, Grupo> = {
  INCIDENCIA_AVERIA_VEHICULO: 'averias',
  INICIO_TRASVASE: 'averias',
  FIN_TRASVASE: 'averias',
  LLEGADA_A_DESTINO: 'entregas',
  INICIO_SERVICIO: 'entregas',
  FIN_SERVICIO_ENTREGA: 'entregas',
  PLANIFICACION_RUTAS: 'rutas',
  REPLANIFICACION_RUTAS: 'rutas',
  DESPACHO_VEHICULO: 'rutas',
  RETORNO_ALMACEN: 'rutas',
  LLEGADA_ALMACEN: 'rutas',
  INCIDENCIA_BLOQUEO: 'alertas',
  INCIDENCIA_NUEVO_PEDIDO: 'alertas',
  PEDIDO_EN_RIESGO_SLA: 'alertas',
};
const GRUPOS: Array<{ clave: Grupo; nombre: string; color: string }> = [
  { clave: 'averias', nombre: 'Averías', color: 'text-rose-400' },
  { clave: 'entregas', nombre: 'Entregas', color: 'text-emerald-400' },
  { clave: 'rutas', nombre: 'Rutas y replan.', color: 'text-sky-400' },
  { clave: 'alertas', nombre: 'Alertas', color: 'text-amber-400' },
  { clave: 'otros', nombre: 'Otros', color: 'text-slate-400' },
];
const COLOR_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.clave, g.color])) as Record<Grupo, string>;
const grupoDe = (tipo: string): Grupo => GRUPO_POR_TIPO[tipo] ?? 'otros';
const esMovimiento = (e: EventoDTO) => e.tipo === 'MOVIMIENTO_TRAMO';

/** Máximo de filas dibujadas: la bitácora completa puede tener miles. */
const MAX_FILAS = 250;
/** Topes del registro acumulado en la sesión (ver historial). */
const TOPE_EVENTOS = 3000;
const TOPE_MOVIMIENTOS = 600;
const claveEvento = (e: EventoDTO) => `${e.instante}|${e.tipo}|${e.vehiculoId ?? ''}|${e.pedidoId ?? ''}|${e.descripcion}`;

const corto = (codigo: string) => (codigo.length > 8 ? `#${codigo.slice(-4)}` : codigo);

/**
 * EstadoOperacionDTO.eventos (la bitácora de la simulación, acumulada lote a lote en la sesión) con
 * filtros por grupo, el vehículo y el pedido de cada evento y hora simulada en 24 h. Click en un evento: selecciona su vehículo (o pedido)
 * y centra el mapa (vuelve a Operación si se está en otra sección). Se cierra con un click fuera,
 * con Esc o al cambiar de sección.
 */
export const EventLogButton: React.FC = () => {
  // Misma línea de tiempo que el mapa: la bitácora no debe mostrar eventos que el mapa todavía no
  // reprodujo.
  const { estadoRaw, vehicles } = useEstadoVisual();
  const [isOpen, setIsOpen] = useState(false);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [verMovimientos, setVerMovimientos] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const centrarEn = useMapStore((s) => s.centrarEn);

  // Al cambiar de sección se cierra (antes quedaba abierto encima de todo).
  useEffect(() => { setIsOpen(false); }, [pathname]);

  // Click fuera y Esc.
  useEffect(() => {
    if (!isOpen) return;
    const alClic = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); buttonRef.current?.focus(); }
    };
    window.addEventListener('mousedown', alClic);
    window.addEventListener('keydown', alTecla);
    return () => {
      window.removeEventListener('mousedown', alClic);
      window.removeEventListener('keydown', alTecla);
    };
  }, [isOpen]);

  // El header del topbar tiene overflow-x-auto, que recorta cualquier hijo absolute: el panel
  // quedaba "dentro" de la barra con scroll. Por eso se renderiza en un portal con position fixed,
  // anclado a la posición del botón.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: r.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  // Cada estado trae solo los eventos de SU lote: antes el registro se vaciaba en cada lote (una
  // avería desaparecía a los segundos). Se acumulan en la sesión, por ejecución y con tope.
  const eventosRaw = estadoRaw?.eventos;
  const idEjecucion = estadoRaw?.idEjecucion ?? null;
  const [historial, setHistorial] = useState<{ id: string | null; eventos: EventoDTO[] }>({ id: null, eventos: [] });
  useEffect(() => {
    if (!eventosRaw) return;
    setHistorial((h) => {
      const base = h.id === idEjecucion ? h.eventos : [];
      const vistos = new Set(base.map(claveEvento));
      const nuevos = eventosRaw.filter((e) => !vistos.has(claveEvento(e)));
      if (nuevos.length === 0 && h.id === idEjecucion) return h;
      const todos = [...base, ...nuevos];
      // Tope: los movimientos de tramo (los más numerosos) se recortan antes que el resto.
      const movs = todos.filter(esMovimiento);
      const resto = todos.filter((e) => !esMovimiento(e));
      const recorte = new Set([...movs.slice(0, Math.max(0, movs.length - TOPE_MOVIMIENTOS)),
        ...resto.slice(0, Math.max(0, resto.length - TOPE_EVENTOS))]);
      return { id: idEjecucion, eventos: recorte.size ? todos.filter((e) => !recorte.has(e)) : todos };
    });
  }, [eventosRaw, idEjecucion]);

  const { eventos, cuentas, movimientos } = useMemo(() => {
    const ordenados = [...historial.eventos].sort(
      (a, b) => parseBackendSimulatedTime(b.instante) - parseBackendSimulatedTime(a.instante),
    );
    const c: Record<Grupo, number> = { averias: 0, entregas: 0, rutas: 0, alertas: 0, otros: 0 };
    let mov = 0;
    for (const e of ordenados) {
      if (esMovimiento(e)) mov += 1;
      else c[grupoDe(e.tipo)] += 1;
    }
    return { eventos: ordenados, cuentas: c, movimientos: mov };
  }, [historial]);

  const visibles = useMemo(() => eventos.filter((e) => {
    if (esMovimiento(e)) return verMovimientos && grupo === null;
    return grupo === null || grupoDe(e.tipo) === grupo;
  }), [eventos, grupo, verMovimientos]);
  const totalSinMov = eventos.length - movimientos;

  const irAEvento = (e: EventoDTO) => {
    if (e.vehiculoId) {
      const v = vehicles.find((x) => x.id === e.vehiculoId || x.code === e.vehiculoId);
      setSelectedVehicleId(v?.id ?? e.vehiculoId);
      const p = v?.position ?? { x: e.x, y: e.y };
      centrarEn(p.x, p.y);
    } else if (e.pedidoId) {
      setSelectedOrderId(e.pedidoId);
      centrarEn(e.x, e.y);
    } else {
      return;
    }
    setIsOpen(false);
    if (pathname !== '/' && !pathname.startsWith('/seguimiento')) navigate('/');
  };

  const chip = (activo: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
      activo ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title="Registro de eventos"
        aria-label="Registro de eventos"
        aria-expanded={isOpen}
        className={`p-1.5 rounded-lg border transition-colors ${isOpen
          ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-blue-500/40'}`}
      >
        <Activity className="h-3.5 w-3.5" />
      </button>

      {isOpen && pos && createPortal(
        // Se abre hacia la DERECHA: el botón vive en el extremo izquierdo de la barra superior. z alto
        // para quedar sobre los paneles de Leaflet (los modales van más arriba).
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Registro de eventos"
          style={{ top: pos.top, left: pos.left }}
          className="tema-panel fixed z-2000 flex max-h-[70vh] w-[min(26rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl"
        >
          <div className="space-y-2 border-b border-slate-800 p-2.5">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
              <h3 className="text-xs font-bold text-white">Registro de eventos</h3>
              <span className="text-[10px] text-slate-500">{visibles.length}</span>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar el registro de eventos"
                className="ml-auto rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo">
              <button type="button" aria-pressed={grupo === null} onClick={() => setGrupo(null)} className={chip(grupo === null)}>
                Todos <span className="font-mono-code text-slate-500">{totalSinMov}</span>
              </button>
              {GRUPOS.map((g) => (
                <button key={g.clave} type="button" aria-pressed={grupo === g.clave}
                  onClick={() => setGrupo((actual) => (actual === g.clave ? null : g.clave))}
                  className={chip(grupo === g.clave)}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-current ${g.color}`} aria-hidden />
                  {g.nombre} <span className="font-mono-code text-slate-500">{cuentas[g.clave]}</span>
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-400">
              <input type="checkbox" checked={verMovimientos} onChange={(e) => setVerMovimientos(e.target.checked)}
                className="h-3 w-3 accent-cyan-500" />
              Mostrar movimientos de tramo ({movimientos}){grupo !== null && verMovimientos ? ' · solo en "Todos"' : ''}
            </label>
          </div>

          {visibles.length === 0 ? (
            <p className="p-4 text-center text-[11px] text-slate-500">
              {eventos.length === 0 ? 'Sin eventos registrados todavía.' : 'Ningún evento con este filtro.'}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-slate-800 overflow-y-auto">
              {visibles.slice(0, MAX_FILAS).map((e, idx) => {
                const Icon = ICONO_POR_TIPO[e.tipo] || Activity;
                const accionable = Boolean(e.vehiculoId || e.pedidoId);
                const contenido = (
                  <>
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${esMovimiento(e) ? 'text-slate-500' : COLOR_GRUPO[grupoDe(e.tipo)]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-medium text-slate-200">{LABEL_POR_TIPO[e.tipo] || e.tipo}</span>
                        {e.vehiculoId && (
                          <span className="shrink-0 rounded border border-slate-700 px-1 font-mono-code text-[10px] font-semibold text-slate-200">{e.vehiculoId}</span>
                        )}
                        {e.pedidoId && (
                          <span className="shrink-0 rounded border border-slate-700 px-1 font-mono-code text-[10px] text-blue-300" title={e.pedidoId}>{corto(e.pedidoId)}</span>
                        )}
                        <span className="ml-auto shrink-0 font-mono-code text-[10px] text-slate-500">
                          {formatFechaHoraCorta(parseBackendSimulatedTime(e.instante))}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-slate-400" title={e.descripcion}>{e.descripcion}</p>
                    </div>
                    {accionable && <LocateFixed className="mt-0.5 h-3 w-3 shrink-0 text-slate-500 group-hover:text-cyan-300" aria-hidden />}
                  </>
                );
                return (
                  <li key={`${e.instante}-${e.tipo}-${idx}`}>
                    {accionable ? (
                      <button type="button" onClick={() => irAEvento(e)}
                        title={e.vehiculoId ? `Ver ${e.vehiculoId} en el mapa` : 'Ver el pedido en el mapa'}
                        className="group flex w-full gap-2 p-2 text-left transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none">
                        {contenido}
                      </button>
                    ) : (
                      <div className="flex gap-2 p-2">{contenido}</div>
                    )}
                  </li>
                );
              })}
              {visibles.length > MAX_FILAS && (
                <li className="p-2 text-center text-[10px] text-slate-500">
                  Se muestran los {MAX_FILAS} más recientes de {visibles.length}
                </li>
              )}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
