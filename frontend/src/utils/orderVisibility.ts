import type { Order } from '../types/order';

/** Cargar un lote no implica que sus pedidos ya hayan llegado al instante visible. */
export function ordersAtSimulatedTime(orders: Order[], nowSimMs: number | null): Order[] {
  if (nowSimMs == null || !Number.isFinite(nowSimMs)) return [];
  return orders.filter((order) =>
    order.arrivalSimMs != null && Number.isFinite(order.arrivalSimMs) && order.arrivalSimMs <= nowSimMs,
  );
}
