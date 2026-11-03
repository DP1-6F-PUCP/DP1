import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { simulationSocket } from '../services/simulationSocket';
import { useScenarioStore } from '../store/scenarioStore';
import { EstadoOperacionDTO } from '../types/backend';

/**
 * Suscribe una sola vez (en el layout raiz) al WS real y empuja cada tick directamente a la
 * cache de React Query -- asi useEstadoOperacion se actualiza en vivo sin esperar al polling, que
 * queda solo como respaldo si el socket se cae.
 *
 * El tick no trae la lista de pedidos: se pide en ese mismo momento (una vez por lote, ya
 * publicada por el backend al cerrar el lote) en vez de cada 3s a ciegas.
 */
export function useSimulationSocket() {
  const queryClient = useQueryClient();
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const transicion = useScenarioStore((s) => s.transicion);
  const id = ejecucion && ['INICIADA', 'EN_CURSO', 'PAUSADA'].includes(ejecucion.estado) ? ejecucion.idEjecucion : null;

  useEffect(() => {
    if (!id || transicion) return;
    simulationSocket.connect();
    const unsubscribe = simulationSocket.subscribe((tick) => {
      const current = useScenarioStore.getState();
      if (current.transicion || current.ejecucion?.idEjecucion !== id || tick.estado.idEjecucion !== id) return;
      queryClient.setQueryData<EstadoOperacionDTO>(['estado-operacion', id], tick.estado);
      queryClient.invalidateQueries({ queryKey: ['pedidos', id] });
    });

    return () => {
      unsubscribe();
      simulationSocket.disconnect();
    };
  }, [queryClient, id, transicion]);
}

/** true mientras el WebSocket de simulacion esta abierto. */
export function useSocketConectado(): boolean {
  return useSyncExternalStore(simulationSocket.subscribeEstado, simulationSocket.isConectado);
}
