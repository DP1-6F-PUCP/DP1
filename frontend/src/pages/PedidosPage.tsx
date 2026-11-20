import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Clock, LocateFixed, Package, PackageCheck, Search, X } from 'lucide-react';
import { Faltan } from '../components/Faltan';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useMapStore } from '../store/mapStore';
import { useScenarioStore } from '../store/scenarioStore';
import { Order, Vehicle } from '../types';
import { formatBackendSimulatedTime24, formatFechaHoraCorta, formatMinutoSimulado } from '../utils/backendTime';
import { pedidosEnServicio, pedidosPorVencer } from '../utils/estadoPedidos';
import { recordarBusquedaPedidos } from '../utils/pedidosUrl';
import { deliveryMs, isDeliveredRecently, WAREHOUSE_WINDOW_HOURS } from '../utils/warehouseShipments';
import {
  isInShipmentListWindow,
  newestOrdersFirst,
  parseWindowHours,
  SHIPMENT_MAX_RENDERED,
  SHIPMENT_PAGE_SIZE,
} from '../utils/shipmentList';

/** Mismos rótulos y colores que el semáforo de pedidos del mapa y de la leyenda. */
const ESTADO: Record<Order['status'], { label: string; hex: string }> = {
  on_time: { label: 'A tiempo', hex: '#10B981' },
  at_risk: { label: 'En riesgo', hex: '#F59E0B' },
  delayed: { label: 'Retrasado', hex: '#F43F5E' },
  collapsed: { label: 'Colapsado', hex: '#991B1B' },
  delivered: { label: 'Entregado', hex: '#3B82F6' },
};
const ORDEN_ESTADOS = ['on_time', 'at_risk', 'delayed', 'collapsed', 'delivered'] as const;

type FiltroEstado = 'all' | Order['status'];
type FiltroPeriodo = 'all' | 'delivered' | 'due';

// Los pedidos ya vienen con su estado AL INSTANTE VISIBLE (ver utils/estadoPedidos.estadoAlInstante):
// un "Entregado" con entrega posterior al reloj aquí ya figura como pendiente.

// Colores compartidos (claro / oscuro). El fondo de la página es --color-background y las
// superficies --color-surface, que ya cambian con el tema.
const BORDE = 'border-slate-200 dark:border-slate-700/70';
const TEXTO_FUERTE = 'text-slate-900 dark:text-slate-100';
const TEXTO = 'text-slate-700 dark:text-slate-300';
const TEXTO_TENUE = 'text-slate-500 dark:text-slate-400';
const ACENTO = 'text-cyan-700 dark:text-cyan-300';
const CAMPO = `rounded-lg border ${BORDE} bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder-slate-500`;

const Chip: React.FC<{ activo: boolean; onClick: () => void; hex?: string; title?: string; children: React.ReactNode }> = ({ activo, onClick, hex, title, children }) => (
  <button
    type="button"
    aria-pressed={activo}
    onClick={onClick}
    title={title}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
      activo
        ? 'border-cyan-600 bg-cyan-50 text-cyan-800 dark:border-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-200'
        : `${BORDE} ${TEXTO} hover:border-slate-400 hover:text-slate-900 dark:hover:border-slate-500 dark:hover:text-white`}`}
  >
    {hex && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} aria-hidden />}
    {children}
  </button>
);

/**
 * Pedidos: la lista completa a todo el ancho (antes vivía en la pestaña Envíos del panel lateral,
 * en 320 px). Sin buscar muestra lo no entregado y lo entregado reciente; al buscar recorre todos
 * los pedidos cargados. Cada fila tiene "Ver en el mapa", que vuelve a Operación con el pedido
 * seleccionado y centrado.
 */
export const PedidosPage: React.FC = () => {
  const navigate = useNavigate();
  const { orders, ordersOmitted = 0, vehicles, warehouses, marcaVisibleMs } = useEstadoVisual();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const centrarEn = useMapStore((s) => s.centrarEn);

  const irAVehiculoDePedido = useMapStore((s) => s.irAVehiculoDePedido);

  // Filtros en la URL (?q=&estado=&periodo=&h=): sobreviven a ir al mapa y volver (atrás del
  // navegador o "Ver todos los pedidos →"). Se reemplaza la entrada del historial, sin apilar una
  // por tecla. Los valores por defecto no se escriben.
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  useEffect(() => { recordarBusquedaPedidos(search); }, [search]);
  const busqueda = params.get('q') ?? '';
  const estadoParam = params.get('estado');
  const estado: FiltroEstado = estadoParam && Object.prototype.hasOwnProperty.call(ESTADO, estadoParam) ? estadoParam as FiltroEstado : 'all';
  const periodoParam = params.get('periodo');
  const periodo: FiltroPeriodo = periodoParam === 'delivered' || periodoParam === 'due' ? periodoParam : 'all';
  // Último valor válido: mientras lo escrito no sirve (vacío, 0, negativo) se sigue filtrando con
  // él y el campo lo dice, en vez de filtrar en silencio con otro número.
  const horas = parseWindowHours(params.get('h') ?? '', WAREHOUSE_WINDOW_HOURS);
  const [horasTexto, setHorasTexto] = useState(String(horas));
  // Si la URL cambia por fuera (atrás del navegador), el campo la sigue.
  useEffect(() => {
    setHorasTexto((t) => (parseWindowHours(t, NaN) === horas ? t : String(horas)));
  }, [horas]);
  const horasInvalidas = parseWindowHours(horasTexto, NaN) !== horas;
  const [mostrar, setMostrar] = useState(SHIPMENT_PAGE_SIZE);
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
  const setBusqueda = (q: string) => actualizar({ q });
  const setEstado = (e: FiltroEstado) => actualizar({ estado: e === 'all' ? null : e });
  const setPeriodo = (p: FiltroPeriodo) => actualizar({ periodo: p === 'all' ? null : p });
  const setHoras = (h: number) => actualizar({ h: h === WAREHOUSE_WINDOW_HOURS ? null : String(h) });

  // En servicio: su vehículo ya está entregando en el destino; ya no puede vencer.
  const enServicio = useMemo(() => pedidosEnServicio(orders, vehicles), [orders, vehicles]);

  // "Vence el plazo": el MISMO criterio y orden que el indicador "Vence #…"/"Vencido #…" del mapa:
  // los ya vencidos (sin entregar, no en servicio) arriba y luego los que vencen en la ventana.
  const porVencer = useMemo(() => {
    if (periodo !== 'due' || marcaVisibleMs === null) return null;
    const lista = pedidosPorVencer(orders, vehicles, marcaVisibleMs,
      { hastaMs: marcaVisibleMs + horas * 3_600_000, incluirVencidos: true, enServicio });
    return new Map(lista.map((p, i) => [p.order.id, i]));
  }, [periodo, orders, vehicles, marcaVisibleMs, horas, enServicio]);

  // Búsqueda + periodo (sin el filtro de estado): sobre esta lista se cuentan los chips de estado,
  // así cada cuenta coincide con las filas que deja ver al pulsarlo.
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return orders.filter((o) => {
      if (!q && !isInShipmentListWindow(o, marcaVisibleMs)) return false;
      if (periodo !== 'all') {
        if (marcaVisibleMs === null) return false;
        if (periodo === 'delivered') {
          if (!isDeliveredRecently(o, marcaVisibleMs, horas)) return false;
        } else if (!porVencer?.has(o.id)) return false;
      }
      return !q || [o.code, o.id, o.clientId].some((v) => v?.toLowerCase().includes(q));
    });
  }, [orders, marcaVisibleMs, busqueda, periodo, horas, porVencer]);

  const filtrados = useMemo(() => {
    const lista = estado === 'all' ? base : base.filter((o) => o.status === estado);
    // "Vence": lo urgente primero (límite más próximo). "Entregados": lo último entregado primero.
    // Si no, lo más reciente primero.
    if (periodo === 'due' && porVencer) return [...lista].sort((a, b) => (porVencer.get(a.id) ?? 0) - (porVencer.get(b.id) ?? 0));
    if (periodo === 'delivered') return [...lista].sort((a, b) => (b.deliveredSimMs ?? 0) - (a.deliveredSimMs ?? 0));
    return newestOrdersFirst(lista);
  }, [base, estado, periodo, porVencer]);

  const cuenta = useMemo(() => {
    const c: Partial<Record<Order['status'], number>> = {};
    for (const o of base) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [base]);

  const visibles = filtrados.slice(0, mostrar);
  const restantes = Math.max(0, filtrados.length - mostrar);
  const total = orders.length + ordersOmitted;
  const horaMin = (min: number) => formatMinutoSimulado(scenarioStartMs, min);

  const verEnMapa = (o: Order) => {
    // También para entregados: el mapa ya no dibuja su pin, pero centrar en el destino basta.
    setSelectedOrderId(o.id);
    centrarEn(o.destination.x, o.destination.y);
    navigate('/');
  };
  const verVehiculo = (v: Vehicle, o: Order) => {
    // Recuerda el pedido: la tarjeta del vehículo lo resalta (a bordo, entregado o en su próxima ruta).
    irAVehiculoDePedido(v.id, o.id);
    centrarEn(v.position.x, v.position.y);
    navigate('/');
  };

  return (
    <div className={`h-full w-full overflow-y-auto bg-[var(--color-background)] px-6 py-5 ${TEXTO_FUERTE}`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Package className="h-5 w-5 text-cyan-600 dark:text-cyan-400" aria-hidden />Pedidos
            </h1>
            <p className={`text-sm ${TEXTO_TENUE}`}>
              {busqueda.trim() ? 'Buscando en todos los pedidos cargados' : 'Sin entregar y entregados recientes'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* El instante contra el que se calculan estados, periodos y "Faltan" (el del mapa). */}
            <span className={`inline-flex items-center gap-1.5 rounded-lg border ${BORDE} bg-[var(--color-surface)] px-2.5 py-1 text-sm ${TEXTO}`}
              title="Hora visible del mapa: estados, periodos y «Faltan» se calculan a este instante">
              <Clock className={`h-3.5 w-3.5 ${TEXTO_TENUE}`} aria-hidden />Hora simulación
              {/* Mismo formato que "Hora simulación" del panel Relojes ("04/08/2027 01:05"). */}
              <span className={`font-mono-code font-semibold ${TEXTO_FUERTE}`}>
                {marcaVisibleMs != null && Number.isFinite(marcaVisibleMs) ? formatBackendSimulatedTime24(marcaVisibleMs) : '--/--/---- --:--'}
              </span>
            </span>
            <span className={`rounded-lg bg-cyan-500/10 px-2.5 py-1 text-sm ${ACENTO}`}
              title="Pedidos en esta lista (con los filtros actuales) de los pedidos en total">
              <span className="font-mono-code font-semibold">{filtrados.length}</span> de <span className="font-mono-code">{total}</span> pedidos
            </span>
          </div>
        </div>

        <div className={`flex flex-wrap items-center gap-3 rounded-xl border ${BORDE} bg-[var(--color-surface)] p-3 shadow-sm`}>
          <div className="relative min-w-[240px] flex-1">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${TEXTO_TENUE}`} aria-hidden />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setMostrar(SHIPMENT_PAGE_SIZE); }}
              placeholder="Código o cliente…"
              aria-label="Buscar pedido"
              className={`w-full py-2 pl-9 pr-8 text-sm ${CAMPO}`}
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
                className={`absolute right-2.5 top-2.5 ${TEXTO_TENUE} hover:text-slate-900 dark:hover:text-white`}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Estado">
            <Chip activo={estado === 'all'} onClick={() => setEstado('all')}>Todos</Chip>
            {ORDEN_ESTADOS.map((k) => (
              <Chip key={k} activo={estado === k} onClick={() => setEstado(estado === k ? 'all' : k)} hex={ESTADO[k].hex}>
                {ESTADO[k].label} <span className={`font-mono-code ${TEXTO_TENUE}`}>{cuenta[k] ?? 0}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Periodo">
            <Chip activo={periodo === 'all'} onClick={() => setPeriodo('all')}>Cualquier momento</Chip>
            <Chip activo={periodo === 'delivered'} onClick={() => setPeriodo('delivered')}
              title="Entregados en las últimas N horas del reloj del mapa">Entregados en las últimas</Chip>
            <Chip activo={periodo === 'due'} onClick={() => setPeriodo('due')}
              title="Sin entregar y cuyo límite (fin del plazo) cae en las próximas N horas; los ya vencidos van arriba; ordenados por límite">Vence el plazo en las próximas</Chip>
            {periodo !== 'all' && (
              <label className={`flex items-center gap-1 text-xs ${TEXTO_TENUE}`}>
                <input
                  type="number" min="1" step="1" inputMode="numeric"
                  value={horasTexto}
                  onChange={(e) => {
                    setHorasTexto(e.target.value);
                    const valor = parseWindowHours(e.target.value, NaN);
                    if (!Number.isNaN(valor)) setHoras(valor);
                  }}
                  onBlur={() => setHorasTexto(String(horas))}
                  aria-label="Horas"
                  aria-invalid={horasInvalidas}
                  title={horasInvalidas ? `Valor no válido: se usa ${horas} h` : undefined}
                  style={horasInvalidas ? { borderColor: '#F43F5E' } : undefined}
                  className={`w-14 px-2 py-1 text-right font-mono-code ${CAMPO} rounded-md`}
                />
                horas
                {horasInvalidas && (
                  <span className="font-semibold text-rose-600 dark:text-rose-400" role="status">· usa {horas} h</span>
                )}
              </label>
            )}
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className={`rounded-xl border border-dashed ${BORDE} bg-[var(--color-surface)] p-10 text-center ${TEXTO_TENUE}`}>
            <Package className="mx-auto mb-2 h-7 w-7 text-slate-400 dark:text-slate-600" aria-hidden />
            <p className={`font-medium ${TEXTO}`}>Sin coincidencias</p>
            <p className="mt-1 text-sm">Prueba con otro código o filtro.</p>
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
            <table className="w-full text-left text-sm">
              <thead className={`sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400`}>
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Pedido</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cant.</th>
                  <th className="px-3 py-2.5 font-semibold">Origen → destino</th>
                  <th className="px-3 py-2.5 font-semibold">Ingreso</th>
                  <th className={`px-3 py-2.5 font-semibold ${periodo === 'due' ? ACENTO : ''}`}
                    aria-sort={periodo === 'due' ? 'ascending' : undefined}>Límite{periodo === 'due' ? ' ↑' : ''}</th>
                  <th className="px-3 py-2.5 font-semibold" title="Tiempo hasta el límite, al reloj del mapa · rojo < 1 h o vencido · ámbar < 3 h (⌛ si aún está a tiempo)">Faltan</th>
                  <th className={`px-3 py-2.5 font-semibold ${periodo === 'delivered' ? ACENTO : ''}`}
                    aria-sort={periodo === 'delivered' ? 'descending' : undefined}>Entrega{periodo === 'delivered' ? ' ↓' : ''}</th>
                  <th className="px-3 py-2.5 font-semibold">Vehículo</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibles.map((o) => {
                  const e = ESTADO[o.status];
                  // Origen real si ya se despachó o tiene ruta; si no, el estimado (con "~").
                  const almacen = warehouses.find((w) => w.id === o.warehouseOriginId);
                  const estimado = almacen ? undefined : warehouses.find((w) => w.id === o.estimatedWarehouseId);
                  const entregado = o.status === 'delivered';
                  // Entregados: el vehículo que lo entregó (evento de entrega) o, si sigue, el de su ruta.
                  const idVehiculo = entregado ? o.deliveredByVehicleId ?? o.assignedVehicleId : o.assignedVehicleId;
                  const vehiculo = idVehiculo
                    ? vehicles.find((v) => v.id === idVehiculo || v.code === idVehiculo)
                    : undefined;
                  const entrega = deliveryMs(o);
                  const limite = o.deadlineSimMs;
                  const servicio = !entregado && enServicio.has(o.id);
                  const faltan = !entregado && limite !== undefined && marcaVisibleMs !== null ? limite - marcaVisibleMs : undefined;
                  return (
                    <tr key={o.id} className={`transition hover:bg-slate-50 dark:hover:bg-white/[0.03] ${servicio ? 'bg-emerald-50/60 dark:bg-emerald-500/[0.06]' : ''}`}>
                      <td className={`px-3 py-2 font-mono-code font-semibold ${TEXTO_FUERTE}`}>{o.code}</td>
                      <td className={`px-3 py-2 ${TEXTO}`}>{o.clientId || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TEXTO_FUERTE}`}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.hex }} aria-hidden />{e.label}
                          {servicio && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-1.5 py-px text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300"
                              title="Su vehículo ya llegó y lo está entregando: el plazo se cumple con la llegada, ya no puede vencer">
                              <PackageCheck className="h-3 w-3" aria-hidden />En servicio
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono-code ${TEXTO_FUERTE}`}>{o.quantity ?? 0}</td>
                      <td className={`px-3 py-2 ${TEXTO}`}>
                        {almacen ? almacen.name : estimado ? <span title="Almacén estimado: aún sin ruta">~{estimado.name}</span> : '—'} → <span className={`font-mono-code ${ACENTO}`}>({o.destination.x}, {o.destination.y})</span>
                      </td>
                      <td className={`px-3 py-2 font-mono-code ${TEXTO}`}>{horaMin(o.createdMinute)}</td>
                      <td className={`px-3 py-2 font-mono-code ${TEXTO}`} title={`Plazo de ${o.slaHours ?? 0} h`}>{formatFechaHoraCorta(limite)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-code">
                        <Faltan ms={faltan} status={o.status} servicio={servicio} />
                      </td>
                      <td className={`px-3 py-2 font-mono-code ${TEXTO}`}
                        title={o.deliveredSimMs === undefined ? 'Estimada' : 'Real'}>
                        {entrega === undefined ? '—' : `${o.deliveredSimMs === undefined ? '~' : ''}${formatFechaHoraCorta(entrega)}`}
                      </td>
                      <td className="px-3 py-2">
                        {vehiculo ? (
                          <button type="button" onClick={() => verVehiculo(vehiculo, o)}
                            title={`Ver ${vehiculo.code} en el mapa`}
                            className={`inline-flex items-center gap-1 rounded-md border border-cyan-600/40 px-1.5 py-0.5 font-mono-code text-xs ${ACENTO} hover:bg-cyan-500/10 dark:border-cyan-500/40`}>
                            <Car className="h-3 w-3" aria-hidden />{vehiculo.code}
                          </button>
                        ) : idVehiculo ? (
                          <span className={`font-mono-code text-xs ${TEXTO}`}>{idVehiculo}</span>
                        ) : entregado ? (
                          <span className={`cursor-help ${TEXTO_TENUE}`} title="Vehículo no disponible tras finalizar la ruta">—</span>
                        ) : <span className={`text-xs italic ${TEXTO_TENUE}`}>Sin asignar</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => verEnMapa(o)}
                          title={entregado ?'Centrar el mapa en el destino (ya entregado)' : 'Seleccionar y centrar en el mapa'}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${ACENTO} hover:bg-cyan-500/10`}>
                          <LocateFixed className="h-3.5 w-3.5" aria-hidden />Ver en el mapa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {restantes > 0 && mostrar < SHIPMENT_MAX_RENDERED && (
          <button type="button"
            onClick={() => setMostrar((n) => Math.min(n + SHIPMENT_PAGE_SIZE, SHIPMENT_MAX_RENDERED))}
            className={`w-full rounded-lg border ${BORDE} bg-[var(--color-surface)] py-2 text-sm ${TEXTO} hover:border-cyan-500 hover:text-slate-900 dark:hover:text-white`}>
            Ver {Math.min(restantes, SHIPMENT_PAGE_SIZE)} más ({restantes} restantes)
          </button>
        )}
        {restantes > 0 && mostrar >= SHIPMENT_MAX_RENDERED && (
          <p className={`text-center text-sm ${TEXTO_TENUE}`}>
            Se muestran como máximo {SHIPMENT_MAX_RENDERED}. Usa la búsqueda o los filtros para encontrar los otros {restantes}.
          </p>
        )}
      </div>
    </div>
  );
};
