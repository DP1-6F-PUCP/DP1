import type { Order } from '../types/order';

/** Antigüedad máxima (en meses simulados) de los pedidos ya entregados que muestra la lista. */
export const SHIPMENT_LIST_MONTHS = 2;
/** Tarjetas que se dibujan de una vez: un solo mes puede traer miles de pedidos. */
export const SHIPMENT_PAGE_SIZE = 100;
/**
 * Máximo de tarjetas en la lista. Medido en el navegador: con 1000 el hilo principal ya queda
 * ocupado ~97 % del tiempo y con 4000 se bloquea 4-5 s seguidos; con 500, ~70 %.
 */
export const SHIPMENT_MAX_RENDERED = 500;
/**
 * Máximo de pedidos entregados y pendientes que el frontend adapta y retiene. Medido en el
 * navegador con 100 tarjetas: 30 000 satura la página (~98 % ocupada, bloqueos de 5 s) y con
 * 40 000-80 000 la lista deja de actualizarse. 15 000 cubre los 2 meses de la lista incluso en
 * los meses de mayor demanda (5000 pedidos/mes).
 */
export const MAX_LOADED_ORDERS = 15_000;

/**
 * Recorta a los `max` elementos más recientes, descartando solo los ya entregados: lo que sigue
 * sin entregar nunca se pierde de vista, aunque por ello se supere `max`.
 */
export function keepRecentOrders<T>(
  items: T[],
  max: number,
  isDelivered: (item: T) => boolean,
  arrivalMs: (item: T) => number,
): T[] {
  if (items.length <= max) return items;
  const excess = items.length - max;
  // La fecha se calcula una vez por elemento: llamar a `arrivalMs` dentro del comparador del sort
  // (n·log n veces, y en el backend es un Date.parse) bloqueaba la página ~0,5 s por recorte.
  const delivered = items.filter(isDelivered).map((item) => ({ item, ms: arrivalMs(item) }));
  if (delivered.length === 0) return items;
  delivered.sort((a, b) => a.ms - b.ms);
  const dropped = new Set(delivered.slice(0, excess).map(({ item }) => item));
  return items.filter((item) => !dropped.has(item));
}

/** Horas escritas en el filtro de envíos; mientras el texto no sea válido se usa `fallback`. */
export function parseWindowHours(text: string, fallback: number): number {
  const hours = Number(text);
  return text.trim() !== '' && Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

/** Resta meses de calendario (UTC, como el reloj simulado): 31-mar menos 1 mes es 28/29-feb. */
export function monthsBeforeMs(nowMs: number, months: number): number {
  const date = new Date(nowMs);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

/** Un pedido sin entregar sigue en la lista aunque sea antiguo: aún requiere seguimiento. */
export function isInShipmentListWindow(order: Order, nowSimMs: number | null): boolean {
  if (nowSimMs === null || order.status !== 'delivered') return true;
  return (order.arrivalSimMs ?? 0) >= monthsBeforeMs(nowSimMs, SHIPMENT_LIST_MONTHS);
}

export function newestOrdersFirst(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => (b.arrivalSimMs ?? 0) - (a.arrivalSimMs ?? 0));
}

/** Primeras `count` tarjetas; el pedido seleccionado siempre se incluye para poder llevarlo a la vista. */
export function ordersToRender(
  matching: Order[],
  count: number,
  selected: Order | undefined,
): Order[] {
  const page = matching.slice(0, count);
  return selected && !page.some((order) => order.id === selected.id) ? [selected, ...page] : page;
}
