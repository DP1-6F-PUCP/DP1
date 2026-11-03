import { Vehicle, Warehouse } from '../types';
import { WAREHOUSE_STOCK_COLORS, WarehouseStockLevel, getWarehouseStockStatus } from './warehouseStock';

/**
 * Indicadores globales del mapa (rúbrica G01, G02 y G04).
 *
 * Los dos semáforos se leen al revés a propósito, según lo que mide cada uno:
 *  - Flota: llenado alto = flota saturada (malo). Verde < 65 %, ámbar 65-84 %, rojo >= 85 %.
 *  - Almacenes: llenado alto = bien abastecidos (bueno). Mismos cortes que el ícono de cada
 *    almacén (ver warehouseStock): verde >= 65 %, ámbar >= 30 %, rojo < 30 %, gris si todos vacíos.
 */

export type FleetFillLevel = 'available' | 'high' | 'saturated';

export const FLEET_FILL_COLORS: Record<FleetFillLevel, { hex: string; label: string }> = {
  available: { hex: '#16A34A', label: 'Con capacidad' },
  high: { hex: '#EAB308', label: 'Ocupación alta' },
  saturated: { hex: '#DC2626', label: 'Saturada' },
};

export interface FleetFill {
  level: FleetFillLevel;
  pct: number;
  load: number;
  capacity: number;
  hex: string;
  label: string;
}

export function getFleetFill(vehicles: Vehicle[]): FleetFill {
  const capacity = vehicles.reduce((sum, v) => sum + (v.capacity || 0), 0);
  const load = vehicles.reduce((sum, v) => sum + (v.currentLoad || 0), 0);
  const pct = capacity > 0 ? Math.min(100, Math.round((load / capacity) * 100)) : 0;
  const level: FleetFillLevel = pct >= 85 ? 'saturated' : pct >= 65 ? 'high' : 'available';
  return { level, pct, load, capacity, ...FLEET_FILL_COLORS[level] };
}

export type WarehousesFillLevel = Exclude<WarehouseStockLevel, 'central'>;

export interface WarehousesFill {
  level: WarehousesFillLevel;
  pct: number;
  stock: number;
  capacity: number;
  hex: string;
  label: string;
  /** Cuántos almacenes intermedios hay en cada nivel del semáforo. */
  counts: Record<WarehousesFillLevel, number>;
  /** Almacenes considerados (sin la oficina principal, que tiene capacidad infinita). */
  total: number;
}

export function getWarehousesFill(warehouses: Warehouse[]): WarehousesFill {
  const finite = warehouses.filter((w) => Number.isFinite(w.capacity));
  const capacity = finite.reduce((sum, w) => sum + (w.capacity || 0), 0);
  const stock = finite.reduce((sum, w) => sum + (w.currentStock || 0), 0);
  const pct = capacity > 0 ? Math.min(100, Math.round((stock / capacity) * 100)) : 0;

  const counts: Record<WarehousesFillLevel, number> = { high: 0, medium: 0, low: 0, empty: 0 };
  finite.forEach((w) => {
    const { level } = getWarehouseStockStatus(w);
    if (level !== 'central') counts[level] += 1;
  });

  const level: WarehousesFillLevel =
    stock <= 0 ? 'empty' : pct >= 65 ? 'high' : pct >= 30 ? 'medium' : 'low';
  return { level, pct, stock, capacity, counts, total: finite.length, ...WAREHOUSE_STOCK_COLORS[level] };
}
