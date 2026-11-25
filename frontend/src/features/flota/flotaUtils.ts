import type { Order, Vehicle } from '../../types';
import type { BreakdownType } from '../../types';
import type { RutaDTO } from '../../types/backend';
import { estadoVehiculo, type EstadoVehiculoFiltro } from '../../utils/filtrosMapa';
import { duracionCorta } from '../../utils/estadoPedidos';
import { parseBackendSimulatedTime } from '../../utils/backendTime';

const HORA = 3_600_000;

/**
 * Regla del profesor: una avería se puede provocar (desde el mapa o desde el listado) solo en
 * vehículos que salieron del almacén hace menos de 4 h.
 */
export const VENTANA_AVERIA_MS = 4 * HORA;

/**
 * Estado de la tabla de Flota: los mismos estados de la leyenda del mapa (estadoVehiculo), con las
 * tres averías juntas en "Averiado" (el tipo va en el propio chip).
 */
export type EstadoFlota = 'disponible' | 'en_ruta' | 'entregando' | 'refrigerio' | 'almacen' | 'averiado' | 'mantenimiento';

export const ORDEN_ESTADOS: EstadoFlota[] = ['disponible', 'en_ruta', 'entregando', 'refrigerio', 'almacen', 'averiado', 'mantenimiento'];

/** Rótulo y color de cada estado; mismos colores que los glifos de la leyenda (LeyendaMapa). */
export const ESTADO_FLOTA: Record<EstadoFlota, { label: string; hex: string; ayuda: string }> = {
  disponible: { label: 'Disponible', hex: '#64748B', ayuda: 'En un almacén, sin ruta: lista para salir' },
  en_ruta: { label: 'Viajando', hex: '#0EA5E9', ayuda: 'En camino a su próxima entrega' },
  entregando: { label: 'Entregando', hex: '#10B981', ayuda: 'Detenida en el destino, sirviendo un pedido' },
  refrigerio: { label: 'Refrigerio', hex: '#F59E0B', ayuda: 'Pausa de refrigerio del conductor' },
  almacen: { label: 'Va al almacén', hex: '#6B7280', ayuda: 'Ya repartió: vuelve a un almacén (o va a cargar)' },
  averiado: { label: 'Averiado', hex: '#F43F5E', ayuda: 'Fuera de servicio por una avería' },
  mantenimiento: { label: 'Mantenimiento', hex: '#EA580C', ayuda: 'En mantenimiento preventivo o reparación' },
};

export const estadoFlota = (v: Vehicle): EstadoFlota => {
  const e: EstadoVehiculoFiltro = estadoVehiculo(v);
  return e.startsWith('averia') ? 'averiado' : (e as EstadoFlota);
};

export const esEstadoFlota = (valor: string | null): valor is EstadoFlota =>
  valor !== null && Object.prototype.hasOwnProperty.call(ESTADO_FLOTA, valor);

/** Tipos de avería: mismos colores y textos cortos que el menú de clic derecho del mapa. */
export const OPCIONES_AVERIA: Array<{ tipo: BreakdownType; hex: string; titulo: string; detalle: string }> = [
  { tipo: 1, hex: '#8B5CF6', titulo: 'Tipo 1 · menor', detalle: '2 h, se repara en el lugar' },
  { tipo: 2, hex: '#EC4899', titulo: 'Tipo 2 · intermedia', detalle: 'Hasta fin del siguiente turno' },
  { tipo: 3, hex: '#14B8A6', titulo: 'Tipo 3 · mayor', detalle: '≥ 2 días, va al almacén central' },
];
export const HEX_AVERIA: Record<BreakdownType, string> = { 1: '#8B5CF6', 2: '#EC4899', 3: '#14B8A6' };

/** Rangos del filtro por distancia al destino (rúbrica E11), semiabiertos [min, max[ en km. */
export const RANGOS_DISTANCIA = [
  { clave: '0-10', label: '0–10 km', min: 0, max: 10 },
  { clave: '10-20', label: '10–20 km', min: 10, max: 20 },
  { clave: '20-40', label: '20–40 km', min: 20, max: 40 },
  { clave: '40-200', label: '40+ km', min: 40, max: Infinity },
] as const;
export type RangoDistancia = (typeof RANGOS_DISTANCIA)[number]['clave'];

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export interface ResumenRuta {
  /** Pedidos de la ruta en curso sin entregar, en orden de entrega. */
  aBordo: Order[];
  entregados: number;
  total: number;
  /** Asignados a su próxima ruta (aún no van a bordo). */
  proximaRuta: Order[];
  /** El pedido que está sirviendo (vehículo detenido en su destino). */
  sirviendo?: Order;
  proximo?: Order;
  /** Destino vigente: su parada pendiente o, si ya repartió, el almacén al que vuelve. */
  destino?: { x: number; y: number };
  kmDestino?: number;
}

/** Pedidos de cada vehículo (por su ruta en curso o asignados a la próxima). O(pedidos). */
export function pedidosPorVehiculo(orders: Order[], vehicles: Vehicle[]): Map<string, Order[]> {
  const enRuta = new Map<string, string>();
  for (const v of vehicles) for (const id of v.assignedOrderIds) enRuta.set(id, v.id);
  const mapa = new Map<string, Order[]>();
  for (const o of orders) {
    const vid = enRuta.get(o.id) ?? o.assignedVehicleId;
    if (!vid) continue;
    const lista = mapa.get(vid);
    if (lista) lista.push(o); else mapa.set(vid, [o]);
  }
  return mapa;
}

/**
 * Mismo criterio que la tarjeta del vehículo del panel lateral: a bordo (sin entregar, en orden de
 * la ruta en curso), entregados de esa ruta y lo asignado a su próxima ruta.
 */
export function resumenRuta(v: Vehicle, pedidos: Order[], enServicio: Set<string>): ResumenRuta {
  const indice = (id: string) => {
    const i = v.assignedOrderIds.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const enRutaActual = (id: string) => v.assignedOrderIds.includes(id);
  const aBordo = pedidos
    .filter((o) => o.status !== 'delivered' && enRutaActual(o.id))
    .sort((a, b) => indice(a.id) - indice(b.id) || (a.deadlineSimMs ?? 0) - (b.deadlineSimMs ?? 0));
  const entregados = pedidos.filter((o) => o.status === 'delivered' && enRutaActual(o.id)).length;
  const proximaRuta = pedidos
    .filter((o) => o.status !== 'delivered' && !enRutaActual(o.id))
    .sort((a, b) => (a.deadlineSimMs ?? 0) - (b.deadlineSimMs ?? 0));
  const sirviendo = v.status === 'delivering' ? aBordo.find((o) => enServicio.has(o.id)) : undefined;
  const proximo = sirviendo ?? aBordo[0];
  const destino = aBordo.length > 0
    ? v.destination ?? aBordo[0].destination
    : v.returnPath.length ? v.returnPath[v.returnPath.length - 1] : undefined;
  return {
    aBordo,
    entregados,
    total: aBordo.length + entregados,
    proximaRuta,
    sirviendo,
    proximo,
    destino,
    kmDestino: destino ? manhattan(v.position, destino) : undefined,
  };
}

export const rangoDe = (km: number | undefined): RangoDistancia | null =>
  km === undefined ? null : RANGOS_DISTANCIA.find((r) => km >= r.min && km < r.max)?.clave ?? null;

export const minutosA = (km: number, kmH: number) => (kmH > 0 ? Math.round((km / kmH) * 60) : undefined);

/**
 * Última salida de cada vehículo al instante visible: la hora de salida (RutaDTO.horaSalida) más
 * reciente de sus rutas ya despachadas (EN_EJECUCION o FINALIZADA) que no sea posterior al reloj del
 * mapa. Si su ruta ya no viene en el estado, se recurre a la salida de los pedidos que lleva.
 */
export function ultimasSalidas(
  rutas: RutaDTO[] | undefined,
  porVehiculo: Map<string, Order[]>,
  ahoraMs: number | null,
): Map<string, number> {
  const salidas = new Map<string, number>();
  if (ahoraMs == null) return salidas;
  const anotar = (vid: string, ms: number) => {
    if (!Number.isFinite(ms) || ms > ahoraMs) return;
    if (ms > (salidas.get(vid) ?? -Infinity)) salidas.set(vid, ms);
  };
  for (const r of rutas ?? []) {
    if ((r.estado === 'EN_EJECUCION' || r.estado === 'FINALIZADA') && r.horaSalida) {
      anotar(r.vehiculoId, parseBackendSimulatedTime(r.horaSalida));
    }
  }
  for (const [vid, pedidos] of porVehiculo) {
    if (salidas.has(vid)) continue;
    for (const o of pedidos) if (o.departed && o.departureSimMs !== undefined) anotar(vid, o.departureSimMs);
  }
  return salidas;
}

export interface Averiable {
  ok: boolean;
  /** Explicación corta (tooltip del botón y lector de pantalla). */
  motivo: string;
}

/**
 * Última salida del almacén ocurrida al reloj visible, con el dato propio del vehículo
 * (VehiculoDTO.salidaAlmacen / salidaAlmacenAnterior). undefined si el backend no lo envía.
 */
export function salidaAlmacenVisible(v: Vehicle, ahoraMs: number | null): number | undefined {
  if (ahoraMs == null || !v.warehouseDepartures?.length) return undefined;
  const previas = v.warehouseDepartures.filter((ms) => Number.isFinite(ms) && ms <= ahoraMs);
  return previas.length ? Math.max(...previas) : undefined;
}

/**
 * ¿Se le puede provocar una avería? Regla: salió del almacén hace menos de 4 h. Usa la hora de
 * salida que envía el backend; `salidaMs` (salida de su ruta, ver ultimasSalidas) queda de respaldo
 * para un backend que aún no la envía.
 */
export function averiable(
  v: Vehicle,
  salidaMs: number | undefined,
  ahoraMs: number | null,
  programada: boolean,
): Averiable {
  if (v.status === 'broken') return { ok: false, motivo: 'Ya está averiado' };
  if (v.status === 'maintenance') return { ok: false, motivo: 'Está en mantenimiento' };
  if (programada) return { ok: false, motivo: 'Ya tiene una avería programada' };
  if (v.status === 'idle') return { ok: false, motivo: 'Está en el almacén: solo se averían vehículos que salieron hace menos de 4 h' };
  if (v.warehouseDepartures !== undefined) salidaMs = salidaAlmacenVisible(v, ahoraMs);
  if (salidaMs === undefined || ahoraMs == null) {
    return { ok: false, motivo: 'No se conoce su hora de salida del almacén' };
  }
  const desde = ahoraMs - salidaMs;
  if (desde >= VENTANA_AVERIA_MS) {
    return { ok: false, motivo: `Salió hace ${duracionCorta(desde)}: solo se averían los que salieron hace menos de 4 h` };
  }
  return { ok: true, motivo: `Salió hace ${duracionCorta(desde)} · se puede averiar durante ${duracionCorta(VENTANA_AVERIA_MS - desde)} más` };
}
