import { httpClient } from './httpClient';
import { EventoDTO } from '../types/backend';

export const alertsApi = {
  async getAlerts(horasUmbralSLA = 1.0): Promise<EventoDTO[]> {
    return await httpClient.get<EventoDTO[]>('/alerts', { params: { horasUmbralSLA } });
  },
};
