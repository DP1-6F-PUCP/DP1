import { Point } from './route';

export type OrderStatus = 'on_time' | 'at_risk' | 'delayed' | 'delivered' | 'collapsed';

export type OrderUrgency = 'normal' | 'priority' | 'critical';

export interface Order {
  id: string;
  code: string;
  warehouseOriginId: string;
  destination: Point;
  createdMinute: number;
  deadlineMinute: number;
  status: OrderStatus;
  assignedVehicleId?: string;
  urgency: OrderUrgency;
  deliveredMinute?: number;
  clientId?: string;
  quantity?: number;
  slaHours?: number;
}
