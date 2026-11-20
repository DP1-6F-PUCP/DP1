import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Clock, Gauge, LocateFixed, MapPin, Package, PackageCheck, Search, Truck, X } from 'lucide-react';
import { Faltan } from '../components/Faltan';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useVehicles } from '../features/vehiculos/hooks/useVehicles';
import { useMapStore } from '../store/mapStore';
import { useAveriasProgramadasStore } from '../store/averiasProgramadasStore';
import { useUmbrales } from '../store/umbralesStore';
import { confirmarAveria } from '../components/map/MenuAveriaVehiculo';
import type { BreakdownType, Vehicle } from '../types';
import { formatBackendSimulatedTime24, formatFechaHoraCorta } from '../utils/backendTime';
import { duracionCorta, pedidosEnServicio } from '../utils/estadoPedidos';
import { getFleetFill } from '../utils/indicadoresGlobales';
import {
  averiable,
  esEstadoFlota,
  ESTADO_FLOTA,
  estadoFlota,
  minutosA,
  ORDEN_ESTADOS,
  pedidosPorVehiculo,
  RANGOS_DISTANCIA,
  rangoDe,
  resumenRuta,
  salidaAlmacenVisible,
  ultimasSalidas,
  VENTANA_AVERIA_MS,
  type EstadoFlota,
  type RangoDistancia,
} from '../features/flota/flotaUtils';
import { BotonAveria } from '../features/flota/components/BotonAveria';
import { HistorialAverias } from '../features/flota/components/HistorialAverias';
import { Mantenimientos, useMantenimientos } from '../features/flota/components/Mantenimientos';
import {
  ACENTO, BarraCarga, BORDE, CAMPO, Chip, ChipEstado, corto, DistintivoAveria, FOCO, ICONO_ESTADO, ICONO_TIPO,
  NOMBRE_TIPO, TEXTO, TEXTO_FUERTE, TEXTO_TENUE, TIPOS_VEHICULO,
} from '../features/flota/components/piezas';

type Orden = 'codigo' | 'estado' | 'carga' | 'limite' | 'destino' | 'salida';
const ORDENES: Orden[] = ['codigo', 'estado', 'carga', 'limite', 'destino', 'salida'];
const TIPOS = ['car', 'motorcycle', 'bicycle'] as const;

/**
 * Flota: todos los vehículos a todo el ancho, al instante visible del mapa. Arriba los KPI por estado
 * (un click filtra la tabla), debajo la tabla con búsqueda, filtros (en la URL, como Pedidos), orden
 * por columnas y, por fila, "Ver en el mapa" y "Averiar" (regla: salió hace < 4 h). Al pie, el
 * historial de averías de la ejecución y los mantenimientos.
 */
export const FlotaPage: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, orders, estadoRaw, marcaVisibleMs } = useEstadoVisual();
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const centrarEn = useMapStore((s) => s.centrarEn);
  const abrirPanel = useMapStore((s) => s.abrirPanel);
  const programadas = useAveriasProgramadasStore((s) => s.pendientes);
  const { reportBreakdown, isReportingBreakdown } = useVehicles();
  const mantenimientos = useMantenimientos(marcaVisibleMs);
  const umbrales = useUmbrales(); // cortes de los semáforos (Configuración → Semáforos)

  // Filtros y orden en la URL (?q=&tipo=&estado=&dist=&averiable=1&orden=&dir=): sobreviven a ir
  // al mapa y volver con el atrás del navegador. Se reemplaza la entrada (no se apila una por tecla).
  const [params, setParams] = useSearchParams();
  const busqueda = params.get('q') ?? '';
  const tipoParam = params.get('tipo');
  const tipo = TIPOS.find((t) => t === tipoParam) ?? null;
  const estadoParam = params.get('estado');
  const estado: EstadoFlota | null = esEstadoFlota(estadoParam) ? estadoParam : null;
  const distParam = params.get('dist');
  const dist = RANGOS_DISTANCIA.find((r) => r.clave === distParam)?.clave ?? null;
  const soloAveriables = params.get('averiable') === '1';
  const ordenParam = params.get('orden');
  const orden: Orden = ORDENES.find((o) => o === ordenParam) ?? 'codigo';
  const desc = params.get('dir') === 'desc';
  const actualizar = (cambios: Record<string, string | null>) => {
    setParams((previos) => {
      const siguientes = new URLSearchParams(previos);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') siguientes.delete(clave);
        else siguientes.set(clave, valor);
      }
      return siguientes;
    }, { replace: true });
  };
  const hayFiltros = Boolean(busqueda || tipo || estado || dist || soloAveriables);
  const limpiarFiltros = () => actualizar({ q: null, tipo: null, estado: null, dist: null, averiable: null });

  // Datos derivados por vehículo, una sola vez por cuadro.
  const enServicio = useMemo(() => pedidosEnServicio(orders, vehicles), [orders, vehicles]);
  const porVehiculo = useMemo(() => pedidosPorVehiculo(orders, vehicles), [orders, vehicles]);
  const salidas = useMemo(() => ultimasSalidas(estadoRaw?.rutas, porVehiculo, marcaVisibleMs),
    [estadoRaw?.rutas, porVehiculo, marcaVisibleMs]);
  const filas = useMemo(() => vehicles.map((v) => {
    const ruta = resumenRuta(v, porVehiculo.get(v.id) ?? [], enServicio);
    // Salida real del almacén (backend); la de su ruta solo si el backend no la envía.
    const salidaMs = v.warehouseDepartures?.length ? salidaAlmacenVisible(v, marcaVisibleMs) : salidas.get(v.id);
    return {
      v,
      e: estadoFlota(v),
      ruta,
      rango: rangoDe(ruta.kmDestino),
      salidaMs,
      averia: averiable(v, salidaMs, marcaVisibleMs, Boolean(programadas[v.id])),
    };
  }), [vehicles, porVehiculo, enServicio, salidas, marcaVisibleMs, programadas]);
  type Fila = (typeof filas)[number];

  // Cada grupo de filtros se cuenta con los DEMÁS filtros aplicados: la cifra de un KPI o un chip es
  // exactamente lo que deja ver al pulsarlo.
  const pasa = (f: Fila, salvo?: 'tipo' | 'estado' | 'dist' | 'averiable') => {
    const q = busqueda.trim().toLowerCase();
    if (q && !f.v.code.toLowerCase().includes(q)) return false;
    if (salvo !== 'tipo' && tipo && f.v.type !== tipo) return false;
    if (salvo !== 'estado' && estado && f.e !== estado) return false;
    if (salvo !== 'dist' && dist && f.rango !== dist) return false;
    if (salvo !== 'averiable' && soloAveriables && !f.averia.ok) return false;
    return true;
  };
  const contar = (salvo: 'tipo' | 'estado' | 'dist' | 'averiable', clave: (f: Fila) => string | null) => {
    const c: Record<string, number> = {};
    for (const f of filas) {
      if (!pasa(f, salvo)) continue;
      const k = clave(f);
      if (k) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };
  const nEstado = contar('estado', (f) => f.e);
  const nAveriaTipo = contar('estado', (f) => (f.e === 'averiado' ? String(f.v.breakdownType ?? 1) : null));
  const nTipo = contar('tipo', (f) => f.v.type);
  const nDist = contar('dist', (f) => f.rango);
  const nAveriables = contar('averiable', (f) => (f.averia.ok ? 'si' : null)).si ?? 0;
  const llenado = getFleetFill(vehicles);

  const valorOrden = (f: Fila): number => {
    switch (orden) {
      case 'estado': return ORDEN_ESTADOS.indexOf(f.e);
      case 'carga': return f.v.capacity > 0 ? f.v.currentLoad / f.v.capacity : 0;
      case 'limite': return f.ruta.sirviendo ? -Infinity : f.ruta.proximo?.deadlineSimMs ?? Infinity;
      case 'destino': return f.ruta.kmDestino ?? Infinity;
      case 'salida': return f.salidaMs ?? -Infinity;
      default: return 0;
    }
  };
  const ordenadas = filas.filter((f) => pasa(f)).sort((a, b) => {
    const d = orden === 'codigo' ? a.v.code.localeCompare(b.v.code) : valorOrden(a) - valorOrden(b);
    // Sin dato (Infinity) siempre al final; empate: por código (orden estable).
    const sinDatoA = !Number.isFinite(valorOrden(a));
    const sinDatoB = !Number.isFinite(valorOrden(b));
    if (orden !== 'codigo' && orden !== 'limite' && sinDatoA !== sinDatoB) return sinDatoA ? 1 : -1;
    return (desc ? -d : d) || a.v.code.localeCompare(b.v.code);
  });

  // Orden congelado con el puntero sobre la tabla (o con un menú abierto): la carga y el límite
  // cambian en cada cuadro y las filas se movían bajo el puntero. Al cambiar el criterio se reordena.
  const [punteroEnTabla, setPunteroEnTabla] = useState(false);
  const ordenPrevio = useRef<{ clave: string; ids: string[] }>({ clave: '', ids: [] });
  const claveOrden = `${orden}:${desc}`;
  if (punteroEnTabla && orden !== 'codigo' && ordenPrevio.current.clave === claveOrden) {
    const pos = new Map(ordenPrevio.current.ids.map((id, i) => [id, i] as const));
    const fin = ordenPrevio.current.ids.length;
    ordenadas.sort((a, b) => (pos.get(a.v.id) ?? fin) - (pos.get(b.v.id) ?? fin));
  }
  ordenPrevio.current = { clave: claveOrden, ids: ordenadas.map((f) => f.v.id) };

  const verEnMapa = (v: Vehicle) => {
    setSelectedVehicleId(v.id);
    centrarEn(v.position.x, v.position.y);
    abrirPanel('fleet');
    navigate('/');
  };
  const averiar = async (v: Vehicle, t: BreakdownType) => {
    if (await confirmarAveria(v.code, t)) reportBreakdown({ vehicleId: v.id, type: t });
  };

  // Se lee el orden vigente de la URL anterior (no del último render): dos clicks seguidos en el
  // mismo encabezado invierten el sentido aunque la página aún no se haya vuelto a dibujar.
  const ordenarPor = (o: Orden) => {
    setParams(() => {
      const previos = new URLSearchParams(window.location.search);
      const siguientes = new URLSearchParams(previos);
      const actual = previos.get('orden') ?? 'codigo';
      if (actual === o) {
        if (previos.get('dir') === 'desc') siguientes.delete('dir'); else siguientes.set('dir', 'desc');
      } else {
        if (o === 'codigo') siguientes.delete('orden'); else siguientes.set('orden', o);
        siguientes.delete('dir');
      }
      return siguientes;
    }, { replace: true });
  };
  // Función (no componente): la página se vuelve a dibujar en cada cuadro del mapa y un componente
  // definido aquí dentro se volvería a montar cada vez (el botón del encabezado perdería el foco).
  const th = (o: Orden | null, children: React.ReactNode, title?: string) => {
    if (!o) return <th scope="col" className="px-3 py-2.5 font-semibold" title={title}>{children}</th>;
    const activo = orden === o;
    const Icono = activo ? (desc ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th scope="col" className="px-1.5 py-1.5 font-semibold" aria-sort={activo ? (desc ? 'descending' : 'ascending') : 'none'}>
        <button type="button" onClick={() => ordenarPor(o)} title={title ? `${title} · click: ordenar` : 'Click: ordenar'}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase tracking-wide hover:bg-slate-200 dark:hover:bg-slate-800 ${FOCO} ${activo ? ACENTO : ''}`}>
          {children}<Icono className={`h-3 w-3 ${activo ? '' : 'opacity-40'}`} aria-hidden />
        </button>
      </th>
    );
  };

  const sinDatos = vehicles.length === 0;
  const totalAveriados = nEstado.averiado ?? 0;

  return (
    <div className={`h-full w-full overflow-y-auto bg-[var(--color-background)] px-6 py-5 ${TEXTO_FUERTE}`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Truck className="h-5 w-5 text-cyan-600 dark:text-cyan-400" aria-hidden />Flota
            </h1>
            <p className={`text-sm ${TEXTO_TENUE}`}>Estado, carga y ruta de cada vehículo al instante del mapa</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border ${BORDE} bg-[var(--color-surface)] px-2.5 py-1 text-sm ${TEXTO}`}
              title="Hora visible del mapa: estados, carga y «Faltan» se calculan a este instante">
              <Clock className={`h-3.5 w-3.5 ${TEXTO_TENUE}`} aria-hidden />Hora simulación
              <span className={`font-mono-code font-semibold ${TEXTO_FUERTE}`}>
                {marcaVisibleMs != null && Number.isFinite(marcaVisibleMs) ? formatBackendSimulatedTime24(marcaVisibleMs) : '--/--/---- --:--'}
              </span>
            </span>
            <span className={`rounded-lg bg-cyan-500/10 px-2.5 py-1 text-sm ${ACENTO}`} title="Vehículos en la tabla (con los filtros actuales) de la flota total">
              <span className="font-mono-code font-semibold">{ordenadas.length}</span> de <span className="font-mono-code">{vehicles.length}</span> vehículos
            </span>
          </div>
        </div>

        {/* KPI por estado: click = filtra la tabla por ese estado (otro click lo quita). */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" role="group" aria-label="Vehículos por estado (click para filtrar)">
          {ORDEN_ESTADOS.map((k) => {
            const Icono = ICONO_ESTADO[k];
            const n = nEstado[k] ?? 0;
            const activo = estado === k;
            const alarma = k === 'averiado' && n > 0;
            return (
              <button key={k} type="button" aria-pressed={activo}
                onClick={() => actualizar({ estado: activo ? null : k })}
                title={`${ESTADO_FLOTA[k].ayuda}\n${activo ? 'Click: quitar el filtro' : 'Click: ver solo estos'}`}
                className={`flex items-center gap-2.5 rounded-xl border bg-[var(--color-surface)] p-2.5 text-left shadow-sm transition ${FOCO} ${
                  activo ? 'border-cyan-600 ring-2 ring-cyan-500/40 dark:border-cyan-500' : `${BORDE} hover:border-slate-400 dark:hover:border-slate-500`}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${ESTADO_FLOTA[k].hex}1F`, color: ESTADO_FLOTA[k].hex }}>
                  <Icono className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className={`block font-mono-code text-lg font-semibold leading-tight ${alarma ? 'text-rose-600 dark:text-rose-400' : TEXTO_FUERTE}`}>{n}</span>
                  <span className={`block truncate text-xs ${TEXTO_TENUE}`}>
                    {ESTADO_FLOTA[k].label}
                    {k === 'averiado' && n > 0 && (
                      <span className="font-mono-code"> · {([1, 2, 3] as const).filter((t) => nAveriaTipo[t]).map((t) => `A${t} ${nAveriaTipo[t]}`).join(' · ')}</span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          <div className={`rounded-xl border ${BORDE} bg-[var(--color-surface)] p-2.5 shadow-sm`}
            title={`Llenado de la flota (G01/G02): carga a bordo / capacidad total.\n${llenado.load} de ${llenado.capacity} paquetes.\nVerde < ${umbrales.flotaAlta} % · ámbar ${umbrales.flotaAlta}–${umbrales.flotaSaturada - 1} % · rojo ≥ ${umbrales.flotaSaturada} %`}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${llenado.hex}1F`, color: llenado.hex }}>
                <Gauge className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={`block font-mono-code text-lg font-semibold leading-tight ${TEXTO_FUERTE}`}>{llenado.pct}%</span>
                <span className={`block truncate text-xs ${TEXTO_TENUE}`}>Llenado de flota</span>
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${llenado.pct}%`, backgroundColor: llenado.hex }} />
            </div>
          </div>
        </div>

        {/* Búsqueda y filtros rápidos */}
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border ${BORDE} bg-[var(--color-surface)] p-3 shadow-sm`}>
          <div className="relative min-w-[200px] flex-1">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${TEXTO_TENUE}`} aria-hidden />
            <input type="text" value={busqueda} onChange={(e) => actualizar({ q: e.target.value })}
              placeholder="Código (TA01, TM03…)" aria-label="Buscar vehículo por código"
              className={`w-full py-2 pl-9 pr-8 text-sm ${CAMPO}`} />
            {busqueda && (
              <button type="button" onClick={() => actualizar({ q: null })} aria-label="Limpiar búsqueda"
                className={`absolute right-2.5 top-2.5 ${TEXTO_TENUE} hover:text-slate-900 dark:hover:text-white`}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tipo de vehículo">
            <Chip activo={!tipo} onClick={() => actualizar({ tipo: null })}>Todos</Chip>
            {TIPOS_VEHICULO.map(({ tipo: t, label, Icono }) => (
              <Chip key={t} activo={tipo === t} onClick={() => actualizar({ tipo: tipo === t ? null : t })}>
                <Icono className="h-3.5 w-3.5" aria-hidden />{label} <span className={`font-mono-code ${TEXTO_TENUE}`}>{nTipo[t] ?? 0}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Distancia al destino">
            <span className={`text-xs ${TEXTO_TENUE}`}>Al destino</span>
            {RANGOS_DISTANCIA.map((r) => (
              <Chip key={r.clave} activo={dist === r.clave} onClick={() => actualizar({ dist: dist === r.clave ? null : r.clave as RangoDistancia })}
                title={`Distancia por recorrer hasta su destino vigente: de ${r.min} km a menos de ${Number.isFinite(r.max) ? `${r.max} km` : '∞'} (los que no tienen destino no entran)`}>
                {r.label} <span className={`font-mono-code ${TEXTO_TENUE}`}>{nDist[r.clave] ?? 0}</span>
              </Chip>
            ))}
          </div>
          <Chip activo={soloAveriables} onClick={() => actualizar({ averiable: soloAveriables ? null : '1' })}
            title="Vehículos a los que se les puede provocar una avería: salieron del almacén hace menos de 4 h">
            Se pueden averiar <span className={`font-mono-code ${TEXTO_TENUE}`}>{nAveriables}</span>
          </Chip>
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros}
              className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${ACENTO} hover:bg-cyan-500/10 ${FOCO}`}>
              <X className="h-3.5 w-3.5" aria-hidden />Quitar filtros
            </button>
          )}
        </div>

        {/* Tabla */}
        {sinDatos ? (
          <div className={`rounded-xl border border-dashed ${BORDE} bg-[var(--color-surface)] p-10 text-center ${TEXTO_TENUE}`}>
            <Truck className="mx-auto mb-2 h-7 w-7 text-slate-400 dark:text-slate-600" aria-hidden />
            <p className={`font-medium ${TEXTO}`}>Aún no hay datos de la flota</p>
            <p className="mt-1 text-sm">Aparecen con el primer lote de la simulación.</p>
          </div>
        ) : ordenadas.length === 0 ? (
          <div className={`rounded-xl border border-dashed ${BORDE} bg-[var(--color-surface)] p-10 text-center ${TEXTO_TENUE}`}>
            <Truck className="mx-auto mb-2 h-7 w-7 text-slate-400 dark:text-slate-600" aria-hidden />
            <p className={`font-medium ${TEXTO}`}>Ningún vehículo con estos filtros</p>
            <button type="button" onClick={limpiarFiltros} className={`mt-2 text-sm font-semibold ${ACENTO} hover:underline ${FOCO}`}>Quitar filtros</button>
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Vehículos de la flota con su estado, carga, próximo pedido y acciones</caption>
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  {th('codigo', 'Vehículo')}
                  {th('estado', 'Estado')}
                  {th('carga', 'Carga', 'Paquetes a bordo / capacidad')}
                  {th('limite', 'Próximo pedido', 'Próximo pedido de su ruta, su límite y lo que falta al reloj del mapa')}
                  {th(null, 'Entregas', 'Entregados de la ruta en curso / pedidos de esa ruta')}
                  {th('destino', 'Al destino', 'Distancia Manhattan y tiempo hasta su destino vigente')}
                  {th('salida', 'Salida', 'Salida del almacén de su viaje actual (hora de salida de su ruta despachada más reciente)')}
                  {th(null, 'Ubicación')}
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800"
                onPointerEnter={() => setPunteroEnTabla(true)} onPointerLeave={() => setPunteroEnTabla(false)}>
                {ordenadas.map(({ v, e, ruta, salidaMs, averia }) => {
                  const TipoIcono = ICONO_TIPO[v.type];
                  const prog = programadas[v.id];
                  const seleccionado = selectedVehicleId === v.id;
                  const p = ruta.proximo;
                  const faltan = p && !ruta.sirviendo && p.deadlineSimMs !== undefined && marcaVisibleMs != null ? p.deadlineSimMs - marcaVisibleMs : undefined;
                  const min = ruta.kmDestino !== undefined ? minutosA(ruta.kmDestino, v.speed) : undefined;
                  const desde = salidaMs !== undefined && marcaVisibleMs != null ? marcaVisibleMs - salidaMs : undefined;
                  const porTrasvasar = e === 'averiado' && ruta.aBordo.length === 0 && v.currentLoad > 0;
                  return (
                    <tr key={v.id} className={`transition hover:bg-slate-50 dark:hover:bg-white/[0.03] ${seleccionado ? 'bg-cyan-50/70 dark:bg-cyan-500/[0.07]' : ''}`}>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-2 font-mono-code font-semibold ${TEXTO_FUERTE}`}>
                          <TipoIcono className={`h-4 w-4 ${TEXTO_TENUE}`} aria-hidden />{v.code}
                          <span className="sr-only">({NOMBRE_TIPO[v.type]})</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <ChipEstado vehiculo={v} />
                          {prog && e !== 'averiado' && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-rose-500/60 px-1.5 py-px text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                              title="Solicitud enviada: el backend la aplica al cerrar el siguiente lote">
                              <Clock className="h-3 w-3" aria-hidden />Avería T{prog.tipo} programada
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2"><BarraCarga carga={v.currentLoad} capacidad={v.capacity} /></td>
                      <td className="px-3 py-2">
                        {ruta.sirviendo ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                            title={`Entregando ${ruta.sirviendo.code}: llegó a su destino, el plazo ya se cumplió`}>
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden />Entregando <span className="font-mono-code">{corto(ruta.sirviendo.code)}</span>
                          </span>
                        ) : p ? (
                          <div className="whitespace-nowrap text-xs leading-snug">
                            <span className={`inline-flex items-center gap-1 font-mono-code font-semibold ${TEXTO_FUERTE}`} title={p.code}>
                              <MapPin className={`h-3 w-3 ${TEXTO_TENUE}`} aria-hidden />{corto(p.code)}
                            </span>
                            <span className={`block font-mono-code ${TEXTO_TENUE}`}>
                              {formatFechaHoraCorta(p.deadlineSimMs)} · <Faltan ms={faltan} status={p.status} />
                            </span>
                          </div>
                        ) : porTrasvasar ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                            title="Sus pedidos ya se replanificaron en otros vehículos; los paquetes pasan a ellos en el trasvase">
                            <Package className="h-3.5 w-3.5" aria-hidden />{v.currentLoad} paq. por trasvasar
                          </span>
                        ) : ruta.proximaRuta.length > 0 ? (
                          <span className={`text-xs ${TEXTO}`} title="Asignados a su próxima ruta (aún no van a bordo)">
                            Próx. ruta <span className="font-mono-code">{ruta.proximaRuta.slice(0, 2).map((o) => corto(o.code)).join(' · ')}{ruta.proximaRuta.length > 2 ? ` +${ruta.proximaRuta.length - 2}` : ''}</span>
                          </span>
                        ) : <span className={`text-xs ${TEXTO_TENUE}`}>{ruta.entregados ? 'Ruta entregada' : '—'}</span>}
                      </td>
                      <td className={`px-3 py-2 font-mono-code text-xs ${TEXTO}`}
                        title={ruta.total ? `Ruta en curso: ${ruta.entregados} entregados de ${ruta.total}` : 'Sin ruta en curso'}>
                        {ruta.total ? <><span className={`font-semibold ${TEXTO_FUERTE}`}>{ruta.entregados}</span>/{ruta.total}</> : <span className={TEXTO_TENUE}>—</span>}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 font-mono-code text-xs ${TEXTO}`}>
                        {ruta.sirviendo && ruta.kmDestino === 0
                          ? <span className={TEXTO_TENUE}>en destino</span>
                          : ruta.kmDestino !== undefined
                          ? <>{ruta.kmDestino} km{min !== undefined && <span className={TEXTO_TENUE}> · {min} min</span>}</>
                          : <span className={TEXTO_TENUE}>—</span>}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-xs ${TEXTO}`}>
                        {salidaMs !== undefined && e !== 'disponible' ? (
                          <>
                            <span className="block font-mono-code">{formatFechaHoraCorta(salidaMs)}</span>
                            {desde !== undefined && (
                              <span className={`block ${desde < VENTANA_AVERIA_MS ? TEXTO_TENUE : 'text-slate-400 dark:text-slate-500'}`}>hace {duracionCorta(desde)}</span>
                            )}
                          </>
                        ) : <span className={TEXTO_TENUE}>—</span>}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 font-mono-code text-xs ${ACENTO}`}>
                        ({Math.round(v.position.x)}, {Math.round(v.position.y)})
                        {mantenimientos.porVehiculo.get(v.code) && (
                          <span className={`block font-sans ${TEXTO_TENUE}`} title="Próximo mantenimiento preventivo">
                            Mant. {mantenimientos.porVehiculo.get(v.code)!.fecha}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => verEnMapa(v)} title={`Seleccionar ${v.code} y centrar el mapa en él`}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${ACENTO} hover:bg-cyan-500/10 ${FOCO}`}>
                            <LocateFixed className="h-3.5 w-3.5" aria-hidden />Ver en el mapa
                          </button>
                          <BotonAveria vehiculo={v} estado={averia} ocupado={isReportingBreakdown} onAveriar={averiar} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!sinDatos && (
          <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${TEXTO_TENUE}`}>
            <span className="inline-flex items-center gap-1"><DistintivoAveria tipo={1} />Averiar: solo vehículos que salieron del almacén hace menos de 4 h</span>
            <span>· «Salida» es la hora de salida de su ruta despachada más reciente (el estado no trae otra hora de salida del vehículo)</span>
            {totalAveriados > 0 && <span>· {totalAveriados} averiado(s) ahora</span>}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <HistorialAverias vehiculos={vehicles} marcaVisibleMs={marcaVisibleMs} onVer={verEnMapa} />
          <Mantenimientos vehiculos={vehicles} marcaVisibleMs={marcaVisibleMs} />
        </div>
      </div>
    </div>
  );
};
