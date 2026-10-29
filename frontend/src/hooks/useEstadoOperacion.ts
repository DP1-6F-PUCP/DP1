import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { estadoOperacionApi } from '../services/estadoOperacionApi';
import { configuracionApi } from '../services/configuracionApi';
import { adaptEstadoOperacion, EstadoAdaptado } from '../utils/backendAdapters';
import { useScenarioStore } from '../store/scenarioStore';
import { useSocketConectado } from './useSimulationSocket';

const ESTADO_VACIO: EstadoAdaptado = { vehicles: [], orders: [], routes: [], warehouses: [], blockedStreets: [] };

/** Con el WebSocket abierto, cada lote llega por push (y los pedidos se piden en ese momento, ver
 * useSimulationSocket): el polling queda solo como red de seguridad lenta. Sin socket, vuelve a
 * ser la fuente principal. */
const POLL_CON_SOCKET_MS = 30_000;
const POLL_SIN_SOCKET_MS = 3_000;

/**
 * Punto unico de lectura del estado operativo EN VIVO: GET /api/estado-operacion + GET
 * /api/pedidos + GET /api/configuracion, cruzados por utils/backendAdapters. Para lo que se
 * MUESTRA junto al mapa usar engine/useEstadoVisual (mismo instante retrasado que el mapa); esto
 * queda para la ingesta del motor y para acciones que se envían al backend.
 */
export function useEstadoOperacion() {
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const socketConectado = useSocketConectado();
  const intervalo = socketConectado ? POLL_CON_SOCKET_MS : POLL_SIN_SOCKET_MS;

  const estadoQuery = useQuery({
    queryKey: ['estado-operacion'],
    queryFn: () => estadoOperacionApi.getEstado(),
    refetchInterval: intervalo,
  });

  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => estadoOperacionApi.getPedidos(),
    refetchInterval: intervalo,
  });

  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => configuracionApi.getConfiguracion(),
    staleTime: 60_000,
  });

  const isLoading = estadoQuery.isLoading || pedidosQuery.isLoading || configuracionQuery.isLoading;
  const isError = estadoQuery.isError || pedidosQuery.isError || configuracionQuery.isError;

  // Antes se recalculaba en CADA render de CADA componente que usa este hook (y devolvia arreglos
  // nuevos cada vez, disparando de nuevo la ingesta del motor). React Query conserva la misma
  // referencia de `data` mientras no cambie, asi que esto solo recalcula con datos nuevos.
  const adaptado: EstadoAdaptado = useMemo(
    () =>
      estadoQuery.data && configuracionQuery.data
        ? adaptEstadoOperacion(estadoQuery.data, configuracionQuery.data, pedidosQuery.data ?? [], scenarioStartMs)
        : ESTADO_VACIO,
    [estadoQuery.data, pedidosQuery.data, configuracionQuery.data, scenarioStartMs],
  );

  return {
    ...adaptado,
    estadoRaw: estadoQuery.data,
    configuracion: configuracionQuery.data,
    isLoading,
    isError,
    refetch: () => {
      estadoQuery.refetch();
      pedidosQuery.refetch();
    },
  };
}
