import type { Order } from '../types/order';
import type { Route } from '../types/route';

/**
 * Unidades cuya ruta en curso lleva el pedido: pueden ser varias si se entrega por partes. Un pedido
 * ya entregado no sigue ninguna, aunque la ruta que lo llevó continúe hacia otras paradas.
 */
export function vehicleIdsCarryingOrder(order: Order, routes: Route[]): Set<string> {
  if (order.status === 'delivered') return new Set();
  return new Set(
    routes
      .filter((route) => route.status === 'in_progress' && route.orderIds.includes(order.id))
      .map((route) => route.vehicleId)
  );
}
