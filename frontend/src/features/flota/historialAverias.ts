import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { escenariosApi } from '../../services/escenariosApi';
import { useScenarioStore } from '../../store/scenarioStore';
import type { BreakdownType } from '../../types';
import { parseBackendSimulatedTime } from '../../utils/backendTime';

/**
 * Historial de averías de la ejecución, para la sección Flota: lo lleva el backend
 * (GET /api/estado-operacion/averias), así que está completo aunque la aplicación se abra tarde.
 */
export interface RegistroAveria {
  clave: string;
  vehiculoId: string;
  tipo?: BreakdownType;
  /** Instante simulado de inicio. */
  instanteMs: number;
  /** Fin estimado: vuelve a estar disponible. */
  finMs: number;
  /** Traslado al almacén central (tipos 2 y 3). */
  trasladoMs?: number;
  x: number;
  y: number;
}

const TIPO: Record<string, BreakdownType> = { TIPO_1: 1, TIPO_2: 2, TIPO_3: 3 };

/** Se vuelve a pedir cada 5 s (≈ un lote) mientras haya ejecución. */
export function useHistorialAverias(): RegistroAveria[] {
  const id = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const { data } = useQuery({
    queryKey: ['averias', id],
    queryFn: ({ signal }) => escenariosApi.consultarAverias(signal),
    enabled: Boolean(id),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
  return useMemo(() => (data ?? []).map((a) => ({
    clave: `${a.idUnidad}|${a.inicio}`,
    vehiculoId: a.idUnidad,
    tipo: TIPO[a.tipoAveria],
    instanteMs: parseBackendSimulatedTime(a.inicio),
    finMs: parseBackendSimulatedTime(a.finEstimado),
    trasladoMs: a.trasladoAlmacen ? parseBackendSimulatedTime(a.trasladoAlmacen) : undefined,
    x: a.x,
    y: a.y,
  })), [data]);
}
