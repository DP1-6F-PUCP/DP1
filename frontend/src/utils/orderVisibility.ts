import type { Order } from '../types/order';
import { estadoAlInstante, pedidosEnServicioDesde } from './estadoPedidos';

/**
 * Pedidos tal como se ven en `nowSimMs` (el instante visible del mapa): solo los que ya llegaron
 * (cargar un lote no implica que sus pedidos ya hayan llegado) y con su estado a ESE instante, no
 * al cierre del lote (ver estadoAlInstante: un "Entregado" con entrega posterior aún va a bordo; un
 * pendiente con el límite pasado ya figura retrasado). Punto único para mapa, panel, indicadores,
 * leyenda y Pedidos. Sin copias si nada cambia.
 *
 * `entregandoEn` (vehículo → posición de los que están entregando a este instante): los pedidos en
 * servicio quedan "a tiempo" aunque el reloj pase su límite (el plazo se cumple con la llegada).
 */
export function ordersAtSimulatedTime(
  orders: Order[],
  nowSimMs: number | null,
  entregandoEn?: Map<string, { x: number; y: number }>,
): Order[] {
  if (nowSimMs == null || !Number.isFinite(nowSimMs)) return [];
  const visibles: Order[] = [];
  const originales: Order[] = [];
  for (const order of orders) {
    if (order.arrivalSimMs != null && Number.isFinite(order.arrivalSimMs) && order.arrivalSimMs <= nowSimMs) {
      visibles.push(estadoAlInstante(order, nowSimMs));
      originales.push(order);
    }
  }
  if (entregandoEn && entregandoEn.size > 0) {
    // En servicio se decide sobre el estado al instante (un "Entregado" futuro aún va a bordo).
    const enServicio = pedidosEnServicioDesde(visibles, entregandoEn);
    if (enServicio.size > 0) {
      for (let i = 0; i < visibles.length; i++) {
        if (enServicio.has(visibles[i].id)) visibles[i] = estadoAlInstante(originales[i], nowSimMs, true);
      }
    }
  }
  return visibles;
}
