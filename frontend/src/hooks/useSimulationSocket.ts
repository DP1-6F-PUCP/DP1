import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { simulationSocket } from '../services/simulationSocket';
import { ingerirLote, ponerseAlDia } from '../services/ingestaLotes';
import { useScenarioStore } from '../store/scenarioStore';

/** Sin socket, cada cuánto se piden los lotes nuevos (antes 3 s con la instantánea completa). */
const POLL_LOTES_SIN_SOCKET_MS = 1_000;

function contextoActual(id: string) {
  const store = useScenarioStore.getState();
  const estado = store.ejecucion?.estado;
  return {
    idEjecucion: id,
    sa: store.ejecucion?.sa,
    k: store.ejecucion?.k ?? 0,
    scenarioStartMs: store.scenarioStartMs(),
    avanzando: estado === 'EN_CURSO' || estado === 'INICIADA',
  };
}

/**
 * Suscribe una sola vez (en el layout raíz) al WS real. Cada lote empujado entra directo al motor
 * y en orden (ver services/ingestaLotes): si falta alguno se recupera por número de secuencia, y
 * los pedidos llegan como cambios que se mezclan con la caché, sin descargar la lista completa.
 * Al reconectar, y mientras el socket está caído, se piden los lotes nuevos cada segundo.
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
      void ingerirLote(queryClient, tick.estado, contextoActual(id));
    });
    // Al (re)conectar se recupera lo publicado mientras no había socket.
    const unsubscribeEstado = simulationSocket.subscribeEstado(() => {
      if (simulationSocket.isConectado()) void ponerseAlDia(queryClient, contextoActual(id)).catch(() => undefined);
    });
    const respaldo = setInterval(() => {
      if (!simulationSocket.isConectado() && !useScenarioStore.getState().transicion) {
        void ponerseAlDia(queryClient, contextoActual(id)).catch(() => undefined);
      }
    }, POLL_LOTES_SIN_SOCKET_MS);
    void ponerseAlDia(queryClient, contextoActual(id)).catch(() => undefined);

    return () => {
      unsubscribe();
      unsubscribeEstado();
      clearInterval(respaldo);
      simulationSocket.disconnect();
    };
  }, [queryClient, id, transicion]);
}

/** true mientras el WebSocket de simulacion esta abierto. */
export function useSocketConectado(): boolean {
  return useSyncExternalStore(simulationSocket.subscribeEstado, simulationSocket.isConectado);
}
