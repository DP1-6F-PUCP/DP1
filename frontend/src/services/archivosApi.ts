import { httpClient } from './httpClient';
import { ArchivoCargadoDTO, ResultadoCargaDTO } from '../types/backend';

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

  async limpiarArchivos(): Promise<void> {
    await httpClient.delete<void>('/files');
  },

  /** Archivos cargados vigentes: precargados (OFFICIAL) y subidos a mano (MANUAL). */
  async listar(signal?: AbortSignal): Promise<ArchivoCargadoDTO[]> {
    return await httpClient.get<ArchivoCargadoDTO[]>('/files', { signal });
  },

  /** Borra un archivo subido a mano y sus datos. */
  async borrarArchivo(id: string): Promise<void> {
    await httpClient.delete<void>(`/files/${encodeURIComponent(id)}`);
  },

  /** Borra TODOS los datos, también los estándar precargados (prueba de sistema sin datos). */
  async borrarTodo(): Promise<void> {
    await httpClient.delete<void>('/files?alcance=todo');
  },

  /** Vuelve a cargar los datos estándar (tras borrarTodo). */
  async restaurarEstandar(): Promise<void> {
    await httpClient.post<void>('/files/estandar', {});
  },
};
