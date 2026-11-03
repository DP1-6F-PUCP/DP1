import { Warehouse } from '../types';

/**
 * Semáforo de stock de un almacén (+ estado "vacío"). Mismos cortes que la lista de almacenes del
 * panel derecho, para que el ícono del mapa y el panel nunca muestren colores distintos:
 *  - verde: >= 65 %   - ámbar: >= 30 %   - rojo: > 0 %   - vacío: 0 paquetes
 * La oficina principal (capacidad infinita) siempre se considera abastecida.
 */
export type WarehouseStockLevel = 'central' | 'high' | 'medium' | 'low' | 'empty';

export interface WarehouseStockStatus {
  level: WarehouseStockLevel;
  /** Porcentaje de llenado 0..100 (100 para la oficina principal). */
  pct: number;
  hex: string;
  label: string;
}

export const WAREHOUSE_STOCK_COLORS: Record<WarehouseStockLevel, { hex: string; label: string }> = {
  central: { hex: '#16A34A', label: 'Oficina principal' },
  high: { hex: '#16A34A', label: 'Abastecido' },
  medium: { hex: '#EAB308', label: 'Nivel medio' },
  low: { hex: '#DC2626', label: 'Por agotarse' },
  empty: { hex: '#94A3B8', label: 'Vacío' },
};

export function getWarehouseStockStatus(w: Warehouse): WarehouseStockStatus {
  if (!Number.isFinite(w.capacity)) {
    return { level: 'central', pct: 100, ...WAREHOUSE_STOCK_COLORS.central };
  }
  // occupancyPct viene del backend (AlmacenDTO.nivelOcupacion); currentStock decide "vacío" para
  // que un redondeo a 0 % con algunos paquetes no se pinte como almacén vacío.
  const pct = Math.max(0, Math.min(100, Math.round(w.occupancyPct)));
  const level: WarehouseStockLevel =
    w.currentStock <= 0 ? 'empty' : pct >= 65 ? 'high' : pct >= 30 ? 'medium' : 'low';
  return { level, pct, ...WAREHOUSE_STOCK_COLORS[level] };
}
