import { useQuery } from '@tanstack/react-query';
import { estadoOperacionApi } from '../services/estadoOperacionApi';
import { configuracionApi } from '../services/configuracionApi';
import { adaptEstadoOperacion, EstadoAdaptado } from '../utils/backendAdapters';
import { useScenarioStore } from '../store/scenarioStore';

const ESTADO_VACIO: EstadoAdaptado = { vehicles: [], orders: [], routes: [], warehouses: [], blockedStreets: [] };

/**
 * Punto unico de lectura del estado operativo real: GET /api/estado-operacion + GET /api/pedidos
 * + GET /api/configuracion, cruzados por utils/backendAdapters. useOrders/useVehicles/useRoutes
 * son wrappers delgados sobre este hook -- un solo fetch compartido (misma queryKey), no uno por
 * feature.
 */
export function useEstadoOperacion() {
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());

  const estadoQuery = useQuery({
    queryKey: ['estado-operacion'],
    queryFn: () => estadoOperacionApi.getEstado(),
    refetchInterval: 3000,
  });

  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => estadoOperacionApi.getPedidos(),
    refetchInterval: 3000,
  });

  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => configuracionApi.getConfiguracion(),
    staleTime: 60_000,
  });

  const isLoading = estadoQuery.isLoading || pedidosQuery.isLoading || configuracionQuery.isLoading;
  const isError = estadoQuery.isError || pedidosQuery.isError || configuracionQuery.isError;

  const adaptado: EstadoAdaptado =
    estadoQuery.data && pedidosQuery.data && configuracionQuery.data
      ? adaptEstadoOperacion(estadoQuery.data, configuracionQuery.data, pedidosQuery.data, scenarioStartMs)
      : ESTADO_VACIO;

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
