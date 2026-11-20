import type { EventoDTO } from '../types/backend';

/**
 * Quién entregó cada pedido. El PedidoDTO no lo trae y la ruta FINALIZADA deja de venir en el
 * estado, así que se recuerda del evento FIN_SERVICIO_ENTREGA de cada lote ingerido. Solo cubre
 * los lotes vistos desde que se abrió la página: lo anterior queda sin dato (se muestra "—").
 */
const vehiculoPorPedido = new Map<string, string>();

export function registrarEntregas(eventos: EventoDTO[] | undefined): void {
  for (const e of eventos ?? []) {
    if (e.tipo === 'FIN_SERVICIO_ENTREGA' && e.pedidoId && e.vehiculoId) vehiculoPorPedido.set(e.pedidoId, e.vehiculoId);
  }
}

export const vehiculoQueEntrego = (idPedido: string): string | undefined => vehiculoPorPedido.get(idPedido);

/** Al cambiar de ejecución: los códigos de pedido se repiten entre ejecuciones. */
export function olvidarEntregas(): void {
  vehiculoPorPedido.clear();
}
