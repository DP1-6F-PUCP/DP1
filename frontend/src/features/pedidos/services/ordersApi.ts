import { httpClient } from '../../../services/httpClient';
import { Order } from '../../../types';
import { INITIAL_WAREHOUSES } from '../../../utils/manhattan';
import { createInitialOrders } from '../../../utils/simulation';

const DEFAULT_ORDERS = createInitialOrders([], INITIAL_WAREHOUSES);

export const ordersApi = {
  async getOrders(): Promise<Order[]> {
    try {
      return await httpClient.get<Order[]>('/orders');
    } catch {
      return DEFAULT_ORDERS;
    }
  },

  async getOrderById(id: string): Promise<Order> {
    try {
      return await httpClient.get<Order>(`/orders/${id}`);
    } catch {
      const found = DEFAULT_ORDERS.find((o) => o.id === id);
      if (!found) throw new Error('Pedido no encontrado');
      return found;
    }
  },

  async assignVehicle(orderId: string, vehicleId: string): Promise<Order> {
    return await httpClient.post<Order>(`/orders/${orderId}/assign`, { vehicleId });
  },
};
