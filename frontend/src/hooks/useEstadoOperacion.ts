import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { estadoOperacionApi } from '../services/estadoOperacionApi';
import { configuracionApi } from '../services/configuracionApi';
import { adaptEstadoOperacion, EstadoAdaptado } from '../utils/backendAdapters';
import type { PedidoDTO } from '../types/backend';
import { useScenarioStore } from '../store/scenarioStore';

const ESTADO_VACIO: EstadoAdaptado = { vehicles: [], orders: [], ordersTotal: 0, routes: [], warehouses: [], blockedStreets: [] };
const SIN_PEDIDOS: PedidoDTO[] = [];

type EntradaAdaptacion = Parameters<typeof adaptEstadoOperacion>;
let ultimaAdaptacion: { entrada: EntradaAdaptacion; resultado: EstadoAdaptado } | null = null;

/**
 * Cada componente que usa este hook tiene su propio useMemo, pero todos reciben las mismas
 * referencias de React Query: sin esta caché el cruce se repetía una vez por componente (~7) en
 * cada lote, y con miles de pedidos eso bloqueaba la página varios segundos seguidos.
 */
function adaptarCompartido(...entrada: EntradaAdaptacion): EstadoAdaptado {
  if (ultimaAdaptacion && entrada.every((valor, i) => valor === ultimaAdaptacion!.entrada[i])) {
    return ultimaAdaptacion.resultado;
  }
  const resultado = adaptEstadoOperacion(...entrada);
  ultimaAdaptacion = { entrada, resultado };
  return resultado;
}

/** Los lotes llegan por push o, sin socket, por GET /lotes cada 1 s (ver useSimulationSocket), con
 * los pedidos como cambios. Estas consultas solo cargan el estado al abrir/recargar la página y
 * quedan como red de seguridad lenta; ya no descargan la lista completa de pedidos cada 3 s. */
const POLL_RESPALDO_MS = 60_000;

/**
 * Punto unico de lectura del estado operativo EN VIVO: GET /api/estado-operacion + GET
 * /api/pedidos + GET /api/configuracion, cruzados por utils/backendAdapters. Para lo que se
 * MUESTRA junto al mapa usar engine/useEstadoVisual (mismo instante retrasado que el mapa); esto
 * queda para la ingesta del motor y para acciones que se envían al backend.
 */
export function useEstadoOperacion() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const transicion = useScenarioStore((s) => s.transicion);
  const activa = ejecucion && ['INICIADA', 'EN_CURSO', 'PAUSADA'].includes(ejecucion.estado);
  const id = activa ? ejecucion.idEjecucion : null;
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const intervalo = POLL_RESPALDO_MS;

  const estadoQuery = useQuery({
    queryKey: ['estado-operacion', id],
    queryFn: ({ signal }) => estadoOperacionApi.getEstado(signal, id ?? undefined),
    enabled: Boolean(id) && !transicion,
    refetchInterval: intervalo,
  });

  const pedidosQuery = useQuery({
    queryKey: ['pedidos', id],
    queryFn: ({ signal }) => estadoOperacionApi.getPedidos(undefined, signal),
    enabled: Boolean(id) && !transicion,
    // La lista completa se baja una sola vez; después se mantiene con los cambios de cada lote.
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: ({ signal }) => configuracionApi.getConfiguracion(signal),
    enabled: !transicion,
    staleTime: 60_000,
    // Red de seguridad para cambios en caliente (ver ingestaLotes.refrescarConfiguracionEnLotes):
    // staleTime solo marca el dato como viejo, no lo vuelve a pedir; sin esto una página abierta
    // podía quedarse con la capacidad/velocidad anterior indefinidamente.
    refetchInterval: id ? 20_000 : false,
    // También sin foco (ventana detrás de otra, o pantalla de exposición): si no, TanStack lo pausa.
    refetchIntervalInBackground: true,
  });

  const isLoading = estadoQuery.isLoading || pedidosQuery.isLoading || configuracionQuery.isLoading;
  const isError = estadoQuery.isError || pedidosQuery.isError || configuracionQuery.isError;

  // Antes se recalculaba en CADA render de CADA componente que usa este hook (y devolvia arreglos
  // nuevos cada vez, disparando de nuevo la ingesta del motor). React Query conserva la misma
  // referencia de `data` mientras no cambie, asi que esto solo recalcula con datos nuevos.
  const adaptado: EstadoAdaptado = useMemo(
    () =>
      estadoQuery.data && configuracionQuery.data
        ? adaptarCompartido(estadoQuery.data, configuracionQuery.data, pedidosQuery.data ?? SIN_PEDIDOS, scenarioStartMs)
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
