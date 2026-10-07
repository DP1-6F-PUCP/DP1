import { httpClient } from './httpClient';
import { ResultadoCargaDTO } from '../types/backend';

/**
 * Los 3 endpoints reales de carga manual de archivo (IngestaController) -- override ad-hoc, no el
 * flujo principal (el backend ya carga solo los archivos oficiales del curso bajo demanda).
 */
export const archivosApi = {
  async cargarPedidos(file: File): Promise<ResultadoCargaDTO> {
    return await httpClient.postFile<ResultadoCargaDTO>('/files/orders', file);
  },

  async cargarBloqueos(file: File): Promise<ResultadoCargaDTO> {
    return await httpClient.postFile<ResultadoCargaDTO>('/files/blocked-streets', file);
  },

  async cargarMantenimiento(file: File): Promise<ResultadoCargaDTO> {
    return await httpClient.postFile<ResultadoCargaDTO>('/files/maintenance', file);
  },
};
