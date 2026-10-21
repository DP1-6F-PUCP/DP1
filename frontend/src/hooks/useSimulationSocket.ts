import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { simulationSocket } from '../services/simulationSocket';
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

  useEffect(() => {
    simulationSocket.connect();
    const unsubscribe = simulationSocket.subscribe((tick) => {
      queryClient.setQueryData<EstadoOperacionDTO>(['estado-operacion'], tick.estado);
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    });

    return () => {
      unsubscribe();
      simulationSocket.disconnect();
    };
  }, [queryClient]);
}

/** true mientras el WebSocket de simulacion esta abierto. */
export function useSocketConectado(): boolean {
  return useSyncExternalStore(simulationSocket.subscribeEstado, simulationSocket.isConectado);
}
