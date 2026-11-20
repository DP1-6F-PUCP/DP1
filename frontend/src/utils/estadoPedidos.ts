import type { Order, OrderStatus } from '../types/order';
import type { Vehicle } from '../types/vehicle';
import { umbrales } from '../store/umbralesStore';

/**
 * Umbral puramente de UI (no es un parámetro de negocio del backend) para resaltar un pedido
 * pendiente que se acerca a su límite: configurable (store/umbralesStore.riesgoMinutos). Lo usan
 * adaptPedido (estado al cierre del lote) y estadoAlInstante (estado al instante visible), así ambos
 * marcan "en riesgo" igual.
 */
export const riesgoMinutos = (): number => umbrales().riesgoMinutos;
const riesgoMs = (): number => riesgoMinutos() * 60_000;

/**
 * Pendiente según su límite frente a `ahoraMs`:
 *  - en servicio (su vehículo ya llegó al destino) → a tiempo: el plazo se cumple con la LLEGADA;
 *  - límite ya pasado → retrasado AL INSTANTE VISIBLE (antes seguía "en riesgo" hasta que el
 *    backend lo marcara INCUMPLIDA al cierre del lote: hasta ~48 min de falsa calma);
 *  - a ≤ RIESGO_MINUTOS del límite → en riesgo.
 */
function estadoPendiente(o: Order, ahoraMs: number, enServicio: boolean): OrderStatus {
  if (enServicio || o.deadlineSimMs === undefined) return 'on_time';
  const resto = o.deadlineSimMs - ahoraMs;
  return resto <= 0 ? 'delayed' : resto <= riesgoMs() ? 'at_risk' : 'on_time';
}

// Una copia por pedido y estado: el mapa recalcula esto por cuadro y no debe crear objetos nuevos
// (ni re-renders) mientras el estado visible no cambie. WeakMap: se libera con el lote.
const copias = new WeakMap<Order, Order>();

/**
 * El pedido tal como debe verse en `ahoraMs` (el instante visible del mapa). El estado del backend
 * corresponde al CIERRE del lote, que va por delante del reloj visible:
 *  - "Entregado" con entrega real posterior a `ahoraMs` → aún pendiente (el vehículo lo lleva). Su
 *    hora de entrega pasa a ser la estimada. Nunca queda "retrasado": el backend solo lo da por
 *    ENTREGADA si llegó a tiempo (si `ahoraMs` ya pasó el límite, está en servicio).
 *  - A tiempo / en riesgo → se recalcula contra `ahoraMs` (mismo umbral que adaptPedido); con el
 *    límite ya pasado y sin estar en servicio, retrasado (ver estadoPendiente).
 *  - Retrasado por el backend (INCUMPLIDA) → se respeta.
 * Inmutable: devuelve el mismo objeto si no cambia nada y, si cambia, una copia reutilizable.
 */
export function estadoAlInstante(o: Order, ahoraMs: number, enServicio = false): Order {
  let status: OrderStatus;
  let entregaFutura = false;
  if (o.status === 'delivered') {
    if (o.deliveredSimMs === undefined || o.deliveredSimMs <= ahoraMs) return o;
    entregaFutura = true;
    // Entregado a tiempo por el backend: si el reloj ya pasó el límite, es que está en servicio.
    status = estadoPendiente(o, ahoraMs, enServicio || (o.deadlineSimMs !== undefined && o.deadlineSimMs <= ahoraMs));
  } else if (o.status === 'on_time' || o.status === 'at_risk') {
    status = estadoPendiente(o, ahoraMs, enServicio);
    if (status === o.status) return o;
  } else {
    return o;
  }
  const previa = copias.get(o);
  if (previa && previa.status === status) return previa;
  const urgency = status === 'at_risk' || status === 'delayed' ? 'priority' : 'normal';
  const copia: Order = entregaFutura
    ? {
      ...o,
      status,
      urgency,
      deliveredSimMs: undefined,
      deliveredMinute: undefined,
      estimatedDeliverySimMs: o.deliveredSimMs,
      // Su ruta pudo terminar dentro del lote (ya no viene): el vehículo que lo entrega lo lleva.
      assignedVehicleId: o.assignedVehicleId ?? o.deliveredByVehicleId,
    }
    : { ...o, status, urgency };
  copias.set(o, copia);
  return copia;
}

/** Entregado al instante visible (tras estadoAlInstante basta con el estado). */
export const estaEntregado = (o: Order) => o.status === 'delivered';

/**
 * Pedidos EN SERVICIO: su vehículo ya llegó y está entregando en su destino. El plazo se cumple
 * con la LLEGADA (el backend evalúa contra el inicio del servicio), así que ya no pueden vencer
 * aunque el servicio termine después del límite. O(pedidos + vehículos).
 */
export function pedidosEnServicio(orders: Order[], vehicles: Vehicle[]): Set<string> {
  const entregando = new Map<string, { x: number; y: number }>();
  for (const v of vehicles) {
    if (v.status === 'delivering') entregando.set(v.id, v.position);
  }
  return pedidosEnServicioDesde(orders, entregando);
}

/** Igual que pedidosEnServicio, con los vehículos que están entregando (id → posición) ya dados. */
export function pedidosEnServicioDesde(orders: Order[], entregandoEn: Map<string, { x: number; y: number }>): Set<string> {
  const entregando = new Map<string, { x: number; y: number }>();
  for (const [id, p] of entregandoEn) entregando.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  const ids = new Set<string>();
  if (entregando.size === 0) return ids;
  for (const o of orders) {
    if (o.status === 'delivered' || !o.assignedVehicleId) continue;
    const p = entregando.get(o.assignedVehicleId);
    if (p && p.x === Math.round(o.destination.x) && p.y === Math.round(o.destination.y)) ids.add(o.id);
  }
  return ids;
}

export interface PorVencer {
  order: Order;
  /** Tiempo hasta su límite; ≤ 0 = ya vencido (solo con `incluirVencidos`). */
  restoMs: number;
}

export interface OpcionesPorVencer {
  /** Acota la ventana: solo límites hasta este instante (los vencidos no se acotan). */
  hastaMs?: number;
  /** Incluye los ya vencidos (límite pasado, sin entregar, no en servicio), que quedan primero. */
  incluirVencidos?: boolean;
  /** Pedidos en servicio ya calculados (si no, se calculan con `vehicles`). */
  enServicio?: Set<string>;
}

/**
 * Criterio ÚNICO de "por vencer" (indicador "Vence #…"/"Vencido #…" y filtro "Vence el plazo" de
 * Pedidos): pendiente al instante visible y no en servicio (el plazo se cumple con la llegada).
 * Por defecto, solo con el límite aún por llegar; con `incluirVencidos`, también los vencidos.
 * Ordenados por límite: los vencidos (el más antiguo primero) y luego el más próximo.
 */
export function pedidosPorVencer(
  orders: Order[],
  vehicles: Vehicle[],
  ahoraMs: number | null,
  { hastaMs, incluirVencidos = false, enServicio = pedidosEnServicio(orders, vehicles) }: OpcionesPorVencer = {},
): PorVencer[] {
  if (ahoraMs == null) return [];
  const lista: PorVencer[] = [];
  for (const o of orders) {
    if (o.status === 'delivered' || o.deadlineSimMs === undefined || enServicio.has(o.id)) continue;
    const vencido = o.deadlineSimMs <= ahoraMs;
    if (vencido ? !incluirVencidos : hastaMs !== undefined && o.deadlineSimMs > hastaMs) continue;
    lista.push({ order: o, restoMs: o.deadlineSimMs - ahoraMs });
  }
  return lista.sort((a, b) => a.restoMs - b.restoMs || a.order.id.localeCompare(b.order.id));
}

/** Compacto: "42m", "2h 58m", "1d 4h"; negativo = "vencido" (ver haceCorto). */
export function duracionCorta(ms: number): string {
  if (ms < 0) return 'vencido';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h}h ${min % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Cuánto hace que venció un plazo (`restoMs` ≤ 0): "hace 12m". */
export const haceCorto = (restoMs: number): string => `hace ${duracionCorta(Math.max(0, -restoMs))}`;

/** Tono de lo que falta para el límite: rojo < 1 h (o vencido), ámbar < 3 h (corte del indicador). */
export const tonoRestante = (ms: number): 'rojo' | 'ambar' | 'neutro' =>
  ms <= 3_600_000 ? 'rojo' : ms <= 3 * 3_600_000 ? 'ambar' : 'neutro';

/**
 * Tono de "Faltan" JUNTO al estado del pedido (tabla de Pedidos, ficha, tarjeta de vehículo): los
 * mismos cortes que el indicador, salvo que un pedido "A tiempo" (semáforo verde del pin, a más de
 * RIESGO_MINUTOS del límite) nunca se pinta ámbar: verde al lado de ámbar se leía como una
 * contradicción. Ese tramo (1-3 h) queda en neutro con un reloj de arena (ver `pronto`).
 */
export function tonoFaltan(ms: number, status: OrderStatus): { tono: 'rojo' | 'ambar' | 'neutro'; pronto: boolean } {
  const tono = tonoRestante(ms);
  if (status === 'on_time' && tono === 'ambar') return { tono: 'neutro', pronto: true };
  return { tono, pronto: false };
}
