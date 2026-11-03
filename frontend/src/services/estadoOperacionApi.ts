import { httpClient } from './httpClient';
import { EstadoOperacionDTO, PedidoDTO } from '../types/backend';

export const estadoOperacionApi = {
  async getEstado(signal?: AbortSignal, idEsperado?: string): Promise<EstadoOperacionDTO> {
    const estado = await httpClient.get<EstadoOperacionDTO>('/estado-operacion', { signal });
    if (idEsperado && estado.idEjecucion !== idEsperado) {
      throw new Error(estado.idEjecucion
        ? 'Se recibieron datos de otra ejecución. Vuelve a iniciar el escenario.'
        : 'El backend debe actualizarse y reiniciarse para identificar la nueva ejecución.');
    }
    return estado;
  },

  async getPedidos(estado?: string, signal?: AbortSignal): Promise<PedidoDTO[]> {
    return await httpClient.get<PedidoDTO[]>('/pedidos', { params: { estado }, signal });
  },
};
