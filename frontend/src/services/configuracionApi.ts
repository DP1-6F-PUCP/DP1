import { httpClient } from './httpClient';
import { ConfiguracionActualDTO } from '../types/backend';

export const configuracionApi = {
  async getConfiguracion(): Promise<ConfiguracionActualDTO> {
    return await httpClient.get<ConfiguracionActualDTO>('/configuracion');
  },
};
