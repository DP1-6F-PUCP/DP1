import { httpClient } from './httpClient';
import { ConfiguracionActualDTO } from '../types/backend';
import type { ValoresOficiales } from '../features/configuracion/parametros';

export const configuracionApi = {
  async getConfiguracion(signal?: AbortSignal): Promise<ConfiguracionActualDTO> {
    return await httpClient.get<ConfiguracionActualDTO>('/configuracion', { signal });
  },
  /** Valores oficiales del caso (perfil inmutable en la base): los usa "Restaurar". */
  async getConfiguracionOficial(signal?: AbortSignal): Promise<ValoresOficiales> {
    return await httpClient.get<ValoresOficiales>('/configuracion/oficial', { signal });
  },
};
