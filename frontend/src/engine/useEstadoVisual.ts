import { useSyncExternalStore } from 'react';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { simulationEngine } from './simulationEngine';
import { EstadoVisual } from './types';

/**
 * Estado de la operación tal como debe MOSTRARSE: el mismo instante retrasado en que el mapa
 * dibuja las posiciones (ver simulationEngine.getEstadoVisual). Usar en todo lo que se muestra
 * junto al mapa (marcadores, badges, semáforo, panel, bitácora) para que nada vaya por delante
 * del mapa.
 *
 * NO usar para acciones que se envían al backend (averías, cambios en caliente): esas necesitan
 * el instante simulado EN VIVO -- ahí sigue correspondiendo useEstadoOperacion.
 *
 * Antes de que el motor tenga su primer cuadro (o sin ejecución) devuelve el estado en vivo.
 */
export function useEstadoVisual(): EstadoVisual {
  const vivo = useEstadoOperacion();
  const visual = useSyncExternalStore(simulationEngine.subscribeVisual, simulationEngine.getEstadoVisual);
  if (visual) return visual;
  return {
    vehicles: vivo.vehicles,
    routes: vivo.routes,
    orders: vivo.orders,
    warehouses: vivo.warehouses,
    blockedStreets: vivo.blockedStreets,
    estadoRaw: vivo.estadoRaw,
    marcaVisibleMs: vivo.estadoRaw?.marcaTiempoActual ? Date.parse(vivo.estadoRaw.marcaTiempoActual) : null,
  };
}
