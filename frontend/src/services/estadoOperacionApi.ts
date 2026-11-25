import { httpClient } from './httpClient';
import { EstadoOperacionDTO, PaginaPedidosDTO, PedidoDTO } from '../types/backend';

export const estadoOperacionApi = {
  async getEstado(signal?: AbortSignal, idEsperado?: string): Promise<EstadoOperacionDTO> {
    const estado = await httpClient.get<EstadoOperacionDTO>('/estado-operacion', { signal });
    if (idEsperado && estado.idEjecucion !== idEsperado) {
      throw new Error(estado.idEjecucion
        ? 'Llegaron datos de otra simulación. Vuelve a iniciarla.'
        : 'El sistema necesita reiniciarse. Avisa a soporte.');
    }
    return estado;
  },

  /** Lotes publicados con secuencia >= desde (el backend conserva los últimos 12), en orden. */
  async getLotesDesde(desde: number, signal?: AbortSignal): Promise<EstadoOperacionDTO[]> {
    return await httpClient.get<EstadoOperacionDTO[]>('/estado-operacion/lotes', { params: { desde }, signal });
  },

  async getPedidos(estado?: string, signal?: AbortSignal): Promise<PedidoDTO[]> {
    return await httpClient.get<PedidoDTO[]>('/pedidos', { params: { estado }, signal });
  },

  /** Historial paginado (más recientes primero), filtrable por estado, texto y rango de ingreso. */
  async getHistorialPedidos(
    filtro: { estado?: string; texto?: string; desde?: string; hasta?: string; pagina?: number; tamano?: number },
    signal?: AbortSignal,
  ): Promise<PaginaPedidosDTO> {
    return await httpClient.get<PaginaPedidosDTO>('/pedidos/historial', { params: filtro, signal });
  },
};
