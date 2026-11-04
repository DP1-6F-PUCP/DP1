import type { Order } from '../types/order';

/** Ventana fija (h) de "por salir" y "entregados" en la card de cada almacén (rúbrica E21/E22). */
export const WAREHOUSE_WINDOW_HOURS = 4;

const WINDOW_MS = WAREHOUSE_WINDOW_HOURS * 3600000;

export interface WarehouseShipments {
  transit: Order[];
  upcoming: Order[];
  delivered: Order[];
}

/** Instante de entrega: el real si está en el lote en curso; si no, el estimado. */
export const deliveryMs = (order: Order) => order.deliveredSimMs ?? order.estimatedDeliverySimMs;

const isDeliveredBy = (order: Order, nowSimMs: number) =>
  order.deliveredSimMs !== undefined && order.deliveredSimMs <= nowSimMs;

/** Pedidos entregados en las últimas 4 h, contra el instante visible del mapa (rúbrica E32). */
export const isDeliveredRecently = (order: Order, nowSimMs: number) =>
  isDeliveredBy(order, nowSimMs) && nowSimMs - (order.deliveredSimMs ?? 0) <= WINDOW_MS;

/** Pedidos que se entregarán en las siguientes 4 h (rúbrica E33). */
export const isDueSoon = (order: Order, nowSimMs: number) => {
  const due = deliveryMs(order);
  return !isDeliveredBy(order, nowSimMs) && due !== undefined && due <= nowSimMs + WINDOW_MS;
};

/** Salida real o planificada si el pedido tiene ruta; si no, la estimada. */
export const upcomingDepartureMs = (order: Order) => order.departureSimMs ?? order.estimatedDepartureSimMs;

/**
 * Envíos de un almacén, partidos por las tres ventanas de su card (rúbrica E20-E22). Se clasifican
 * por sus instantes contra el instante VISIBLE del mapa, no contra marcaTiempoActual ni por
 * status/departed: esos describen el FINAL del lote, y el mapa va animando dentro de él -- así un
 * pedido que sale o se entrega más tarde en el lote no aparece "en tránsito" o desaparece antes de
 * tiempo.
 */
export function classifyWarehouseShipments(
  orders: Order[],
  warehouseId: string,
  nowSimMs: number | null
): WarehouseShipments {
  if (nowSimMs === null) return { transit: [], upcoming: [], delivered: [] };
  const isDeliveredByNow = (order: Order) => isDeliveredBy(order, nowSimMs);
  const hasLeftByNow = (order: Order) =>
    order.departed === true && (order.departureSimMs === undefined || order.departureSimMs <= nowSimMs);
  const fromWarehouse = orders.filter((order) => order.warehouseOriginId === warehouseId);
  const waitingAtWarehouse = orders.filter(
    (order) => order.warehouseOriginId === warehouseId || order.estimatedWarehouseId === warehouseId
  );
  return {
    transit: fromWarehouse.filter((order) => !isDeliveredByNow(order) && hasLeftByNow(order)),
    upcoming: waitingAtWarehouse
      .filter((order) => {
        const departure = upcomingDepartureMs(order);
        return (
          !isDeliveredByNow(order) &&
          !hasLeftByNow(order) &&
          departure !== undefined &&
          departure <= nowSimMs + WINDOW_MS
        );
      })
      .sort((a, b) => (upcomingDepartureMs(a) ?? 0) - (upcomingDepartureMs(b) ?? 0)),
    delivered: fromWarehouse
      .filter((order) => isDeliveredRecently(order, nowSimMs))
      .sort((a, b) => (b.deliveredSimMs ?? 0) - (a.deliveredSimMs ?? 0)),
  };
}
