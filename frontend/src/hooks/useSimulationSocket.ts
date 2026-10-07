import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { simulationSocket } from '../services/simulationSocket';
import { EstadoOperacionDTO } from '../types/backend';

/**
 * Suscribe una sola vez (en el layout raiz) al WS real y empuja cada tick directamente a la
 * cache de React Query -- asi useEstadoOperacion se actualiza en vivo sin esperar al polling de
 * 3s, y el polling queda solo como respaldo si el socket se cae.
 */
export function useSimulationSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    simulationSocket.connect();
    const unsubscribe = simulationSocket.subscribe((tick) => {
      queryClient.setQueryData<EstadoOperacionDTO>(['estado-operacion'], tick.estado);
    });

    return () => {
      unsubscribe();
      simulationSocket.disconnect();
    };
  }, [queryClient]);
}
