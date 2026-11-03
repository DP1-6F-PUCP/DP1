import { Point } from './route';

export type OrderStatus = 'on_time' | 'at_risk' | 'delayed' | 'delivered' | 'collapsed';

export type OrderUrgency = 'normal' | 'priority' | 'critical';

export interface Order {
  id: string;
  code: string;
  warehouseOriginId: string;
  destination: Point;
  /** Instante de llegada del pedido en el reloj simulado (convención UTC del backend). */
  arrivalSimMs?: number;
  createdMinute: number;
  deadlineMinute: number;
  status: OrderStatus;
  assignedVehicleId?: string;
  urgency: OrderUrgency;
  deliveredMinute?: number;
  /** Instante simulado de la entrega final (PedidoDTO.fechaEntrega), si ya fue entregado. */
  deliveredSimMs?: number;
  /** Instante simulado de salida de su ruta: real si ya se despachó, planificado si no. */
  departureSimMs?: number;
  /** true cuando la ruta que lo lleva ya salió del almacén (EN_EJECUCION o FINALIZADA). */
  departed?: boolean;
  clientId?: string;
  quantity?: number;
  slaHours?: number;
}
