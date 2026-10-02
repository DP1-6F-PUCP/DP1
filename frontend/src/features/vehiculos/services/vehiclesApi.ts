import { httpClient } from '../../../services/httpClient';
import { Vehicle, BreakdownType } from '../../../types';
import { INITIAL_WAREHOUSES, INITIAL_BLOCKED_STREETS } from '../../../utils/manhattan';
import { createInitialFleet } from '../../../utils/simulation';

const DEFAULT_FLEET = createInitialFleet(
  { car: 6, motorcycle: 10, bicycle: 8 },
  INITIAL_WAREHOUSES,
  INITIAL_BLOCKED_STREETS
);

export const vehiclesApi = {
  async getVehicles(): Promise<Vehicle[]> {
    try {
      return await httpClient.get<Vehicle[]>('/vehicles');
    } catch {
      // Fallback
      return DEFAULT_FLEET;
    }
  },

  async getVehicleById(id: string): Promise<Vehicle> {
    try {
      return await httpClient.get<Vehicle>(`/vehicles/${id}`);
    } catch {
      const found = DEFAULT_FLEET.find((v) => v.id === id);
      if (!found) throw new Error('Vehículo no encontrado');
      return found;
    }
  },

  async reportBreakdown(vehicleId: string, type: BreakdownType, reason?: string): Promise<Vehicle> {
    try {
      return await httpClient.post<Vehicle>('/simulation/breakdowns', {
        vehicleId,
        type,
        reason,
      });
    } catch {
      // Fallback local
      const target = DEFAULT_FLEET.find((v) => v.id === vehicleId) || DEFAULT_FLEET[0];
      return {
        ...target,
        status: 'broken',
        breakdownType: type,
        breakdownReason: reason || `Avería Tipo ${type}`,
      };
    }
  },
};
