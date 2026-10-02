import { httpClient } from '../../../services/httpClient';
import { Route } from '../../../types';

// Mock/Default fallback dataset en caso de que el backend esté en arranque
export const INITIAL_ROUTES: Route[] = [
  {
    id: 'rt-101',
    vehicleId: 'veh-ta01',
    vehicleCode: 'TA01',
    origin: { x: 27, y: 14 },
    destination: { x: 45, y: 22 },
    waypoints: [
      { x: 27, y: 14 },
      { x: 45, y: 14 },
      { x: 45, y: 22 },
    ],
    distanceKm: 26,
    estimatedDurationMinutes: 32,
    status: 'in_progress',
    assignedOrderCount: 4,
  },
  {
    id: 'rt-102',
    vehicleId: 'veh-tm02',
    vehicleCode: 'TM02',
    origin: { x: 12, y: 38 },
    destination: { x: 25, y: 30 },
    waypoints: [
      { x: 12, y: 38 },
      { x: 25, y: 38 },
      { x: 25, y: 30 },
    ],
    distanceKm: 21,
    estimatedDurationMinutes: 22,
    status: 'in_progress',
    assignedOrderCount: 2,
  },
  {
    id: 'rt-103',
    vehicleId: 'veh-tb03',
    vehicleCode: 'TB03',
    origin: { x: 57, y: 27 },
    destination: { x: 62, y: 24 },
    waypoints: [
      { x: 57, y: 27 },
      { x: 62, y: 27 },
      { x: 62, y: 24 },
    ],
    distanceKm: 8,
    estimatedDurationMinutes: 24,
    status: 'planned',
    assignedOrderCount: 1,
  },
];

export const routesApi = {
  async getRoutes(): Promise<Route[]> {
    try {
      return await httpClient.get<Route[]>('/routes');
    } catch {
      // Fallback resiliente
      return INITIAL_ROUTES;
    }
  },

  async getRouteById(id: string): Promise<Route> {
    try {
      return await httpClient.get<Route>(`/routes/${id}`);
    } catch {
      const found = INITIAL_ROUTES.find((r) => r.id === id);
      if (!found) throw new Error('Ruta no encontrada');
      return found;
    }
  },

  async recalculateRoute(routeId: string, detourAvoidance = true): Promise<Route> {
    return await httpClient.post<Route>(`/routes/${routeId}/recalculate`, { detourAvoidance });
  },
};
