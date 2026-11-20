import type { EstadoVisual } from '../../engine/types';
import { estadoVehiculo } from '../../utils/filtrosMapa';
import { getFleetFill, getWarehousesFill } from '../../utils/indicadoresGlobales';
import type { Muestra, MuestraFlota } from './historialStore';

/** Vehículos en los cuatro grupos del gráfico de flota (mismos criterios que la leyenda del mapa). */
export function contarFlota(vehicles: EstadoVisual['vehicles']): MuestraFlota {
  const f: MuestraFlota = { enRuta: 0, refrigerio: 0, disponible: 0, fueraServicio: 0 };
  for (const v of vehicles) {
    const e = estadoVehiculo(v);
    if (e === 'disponible') f.disponible += 1;
    else if (e === 'refrigerio') f.refrigerio += 1;
    else if (e === 'en_ruta' || e === 'entregando' || e === 'almacen') f.enRuta += 1;
    else f.fueraServicio += 1; // mantenimiento y averías 1-3
  }
  return f;
}

/** Cifras del instante visible. Contadores de pedidos al reloj del mapa; OTD, costo, averías e
 * incumplidos son los del backend (cierre del lote que se reproduce). */
export function tomarMuestra(v: EstadoVisual): Muestra | null {
  if (v.marcaVisibleMs == null || !Number.isFinite(v.marcaVisibleMs)) return null;
  const omitidos = v.ordersOmitted ?? 0; // entregados antiguos que ya no se retienen
  let entregados = omitidos;
  let sinAsignar = 0;
  let retrasados = 0;
  for (const o of v.orders) {
    if (o.status === 'delivered') entregados += 1;
    else {
      if (!o.assignedVehicleId) sinAsignar += 1;
      if (o.status === 'delayed' || o.status === 'collapsed') retrasados += 1;
    }
  }
  const recibidos = v.orders.length + omitidos;
  const m = v.estadoRaw?.metricas;
  const resueltos = (m?.contadorEntregados ?? 0) + (m?.contadorIncumplidos ?? 0);
  const almacenes: Record<string, number> = {};
  for (const w of v.warehouses) {
    if (Number.isFinite(w.capacity) && w.capacity > 0) {
      almacenes[w.name] = Math.max(0, Math.min(100, (w.currentStock / w.capacity) * 100));
    }
  }
  return {
    t: v.marcaVisibleMs,
    recibidos,
    entregados,
    pendientes: recibidos - entregados,
    sinAsignar,
    retrasados,
    incumplidos: m?.contadorIncumplidos ?? 0,
    otd: m && resueltos > 0 ? m.porcentajeEntregasATiempo : null,
    costo: m?.costoTotalAcumulado ?? 0,
    averias: m?.contadorAverias ?? 0,
    flota: contarFlota(v.vehicles),
    flotaPct: getFleetFill(v.vehicles).pct,
    almacenesPct: getWarehousesFill(v.warehouses).pct,
    almacenes,
  };
}
