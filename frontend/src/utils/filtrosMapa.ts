import type { Order, Vehicle, Warehouse } from '../types';
import { getWarehouseStockStatus, WarehouseStockLevel } from './warehouseStock';
import { umbrales } from '../store/umbralesStore';

/**
 * Filtros del mapa que se aplican desde la leyenda: cada fila de la leyenda es un grupo y cada
 * elemento, un valor. Dentro de un grupo los valores se suman (O); entre grupos se combinan (Y).
 * Un grupo vacío no filtra. Los criterios son los mismos con los que el mapa pinta cada marcador
 * (ver LeafletManhattanMap), así lo que se marca en la leyenda es exactamente lo que se ve.
 */
export type GrupoFiltro = 'vehTipo' | 'vehCarga' | 'vehEstado' | 'pedido' | 'almacen';
export type FiltrosMapa = Record<GrupoFiltro, string[]>;

export const FILTROS_VACIOS: FiltrosMapa = { vehTipo: [], vehCarga: [], vehEstado: [], pedido: [], almacen: [] };

/** Nivel de carga a bordo con los cortes configurables (store/umbralesStore: cargaAlta, cargaMedia). */
export function nivelCarga(v: Vehicle): 'alta' | 'media' | 'baja' {
  return nivelCargaPct(v.capacity > 0 ? (v.currentLoad / v.capacity) * 100 : 0);
}

export function nivelCargaPct(pct: number): 'alta' | 'media' | 'baja' {
  const u = umbrales();
  return pct >= u.cargaAlta ? 'alta' : pct >= u.cargaMedia ? 'media' : 'baja';
}

export type EstadoVehiculoFiltro =
  | 'en_ruta' | 'entregando' | 'refrigerio' | 'almacen' | 'disponible' | 'mantenimiento'
  | 'averia1' | 'averia2' | 'averia3';

/** Estado tal como lo muestra el mapa en el instante visible (gris = va al almacén). */
export function estadoVehiculo(v: Vehicle): EstadoVehiculoFiltro {
  if (v.status === 'broken') return `averia${v.breakdownType ?? 1}` as EstadoVehiculoFiltro;
  if (v.status === 'maintenance') return 'mantenimiento';
  if (v.status === 'on_break') return 'refrigerio';
  if (v.status === 'delivering') return 'entregando';
  if (v.status === 'idle') return 'disponible';
  return v.returningVisible ? 'almacen' : 'en_ruta';
}

export const nivelAlmacen = (w: Warehouse): WarehouseStockLevel => getWarehouseStockStatus(w).level;

const pasa = (f: FiltrosMapa, grupo: GrupoFiltro, valor: string) => f[grupo].length === 0 || f[grupo].includes(valor);

export const vehiculoVisible = (f: FiltrosMapa, v: Vehicle) =>
  pasa(f, 'vehTipo', v.type) && pasa(f, 'vehCarga', nivelCarga(v)) && pasa(f, 'vehEstado', estadoVehiculo(v));
export const pedidoVisible = (f: FiltrosMapa, o: Order) => pasa(f, 'pedido', o.status);
export const almacenVisible = (f: FiltrosMapa, w: Warehouse) => pasa(f, 'almacen', nivelAlmacen(w));

export const hayFiltros = (f: FiltrosMapa) => Object.values(f).some((valores) => valores.length > 0);
