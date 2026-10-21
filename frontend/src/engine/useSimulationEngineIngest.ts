import { useEffect } from 'react';
import { BlockedStreet, Route, Vehicle } from '../types';
import { useScenarioStore } from '../store/scenarioStore';
import { simulationEngine } from './simulationEngine';

/**
 * Unico punto de ingesta del motor de simulacion -- llamado UNA vez en el layout raiz (ver
 * router/index.tsx), donde `vehicles`/`routes`/`blockedStreets` ya vienen adaptados por
 * useEstadoOperacion (misma query cacheada por React Query, sin fetch adicional).
 */
export function useSimulationEngineIngest(
  vehicles: Vehicle[],
  routes: Route[],
  blockedStreets: BlockedStreet[],
  marcaTiempoActual: string | null
): void {
  const idEjecucion = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const sa = useScenarioStore((s) => s.ejecucion?.sa);
  const k = useScenarioStore((s) => s.ejecucion?.k) ?? 0;
  const estadoEjecucion = useScenarioStore((s) => s.ejecucion?.estado);
  const avanzando = estadoEjecucion === 'EN_CURSO' || estadoEjecucion === 'INICIADA';

  useEffect(() => {
    simulationEngine.ingest({ vehicles, routes, blockedStreets, idEjecucion, sa, marcaTiempoActual, k, avanzando });
  }, [vehicles, routes, blockedStreets, idEjecucion, sa, marcaTiempoActual, k, avanzando]);
}
