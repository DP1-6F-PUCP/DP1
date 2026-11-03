import { httpClient } from './httpClient';
import {
  EjecucionEscenarioDTO,
  ProgramarSolicitudRequest,
  SeleccionarEscenarioRequest,
  ReporteSimulacionDTO,
} from '../types/backend';

export const escenariosApi = {
  async consultarReporte(id: string, signal?: AbortSignal): Promise<ReporteSimulacionDTO> {
    return httpClient.get<ReporteSimulacionDTO>(`/escenarios/${id}/reporte`, { signal });
  },
  async iniciarEscenario(request: SeleccionarEscenarioRequest): Promise<EjecucionEscenarioDTO> {
    return await httpClient.post<EjecucionEscenarioDTO>('/escenarios', request);
  },

  async consultarEscenario(idEjecucion: string, signal?: AbortSignal): Promise<EjecucionEscenarioDTO> {
    return await httpClient.get<EjecucionEscenarioDTO>(`/escenarios/${idEjecucion}`, { signal });
  },

  /**
   * GET /api/escenarios/activa -- antes no existia forma de saber si ya habia una ejecucion
   * corriendo sin conocer su id de antemano; una pestana recien cargada siempre mostraba la
   * pantalla de "Iniciar ejecucion" aunque el backend ya tuviera una activa, hasta que el usuario
   * volvia a hacer clic manualmente. Devuelve null si no hay ninguna.
   */
  async consultarActiva(signal?: AbortSignal): Promise<EjecucionEscenarioDTO | null> {
    return await httpClient.get<EjecucionEscenarioDTO | null>('/escenarios/activa', { signal });
  },

  async programarSolicitud(idEjecucion: string, request: ProgramarSolicitudRequest): Promise<void> {
    await httpClient.post<void>(`/escenarios/${idEjecucion}/solicitudes`, request);
  },

  async pausar(idEjecucion: string): Promise<void> {
    await httpClient.post<void>(`/escenarios/${idEjecucion}/pausar`);
  },

  async reanudar(idEjecucion: string): Promise<void> {
    await httpClient.post<void>(`/escenarios/${idEjecucion}/reanudar`);
  },

  async detener(idEjecucion: string): Promise<void> {
    await httpClient.post<void>(`/escenarios/${idEjecucion}/detener`);
  },
};
