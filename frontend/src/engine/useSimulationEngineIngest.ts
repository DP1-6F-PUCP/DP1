import { useEffect, useMemo } from 'react';
import { BlockedStreet, Order, Route, Vehicle, Warehouse } from '../types';
import type { EstadoOperacionDTO } from '../types/backend';
import { useScenarioStore } from '../store/scenarioStore';
import { simulationEngine } from './simulationEngine';
import { FrameData } from './types';

interface IngestInput {
  vehicles: Vehicle[];
  routes: Route[];
  orders: Order[];
  warehouses: Warehouse[];
  blockedStreets: BlockedStreet[];
  estadoRaw: EstadoOperacionDTO | undefined;
}

/**
 * Unico punto de ingesta del motor de simulacion -- llamado UNA vez en el layout raiz (ver
 * router/index.tsx), con el estado EN VIVO ya adaptado por useEstadoOperacion. El motor guarda
 * cada lote como un cuadro y la UI lee el estado retrasado con useEstadoVisual.
 */
export function useSimulationEngineIngest({ vehicles, routes, orders, warehouses, blockedStreets, estadoRaw }: IngestInput): void {
  const idEjecucion = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const sa = useScenarioStore((s) => s.ejecucion?.sa);
  const k = useScenarioStore((s) => s.ejecucion?.k) ?? 0;
  const estadoEjecucion = useScenarioStore((s) => s.ejecucion?.estado);
  const avanzando = estadoEjecucion === 'EN_CURSO' || estadoEjecucion === 'INICIADA';
  const marcaTiempoActual = estadoRaw?.marcaTiempoActual ?? null;

  const frame = useMemo<FrameData>(
    () => ({ vehicles, routes, orders, warehouses, blockedStreets, estadoRaw }),
    [vehicles, routes, orders, warehouses, blockedStreets, estadoRaw],
  );

  useEffect(() => {
    // Las consultas se completan por separado; no sustituir una flota válida por un vacío de carga.
    if (!idEjecucion || !estadoRaw || (estadoRaw.vehiculos.length > 0 && vehicles.length === 0)) return;
    simulationEngine.ingest({ vehicles, routes, frame, idEjecucion, sa, marcaTiempoActual, k, avanzando });
  }, [vehicles, routes, frame, idEjecucion, sa, marcaTiempoActual, k, avanzando]);
}
