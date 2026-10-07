import { httpClient } from './httpClient';
import { EstadoOperacionDTO, PedidoDTO } from '../types/backend';

export const estadoOperacionApi = {
  async getEstado(): Promise<EstadoOperacionDTO> {
    return await httpClient.get<EstadoOperacionDTO>('/estado-operacion');
  },

  async getPedidos(estado?: string): Promise<PedidoDTO[]> {
    return await httpClient.get<PedidoDTO[]>('/pedidos', { params: { estado } });
  },
};
