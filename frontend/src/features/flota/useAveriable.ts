import { useMemo } from 'react';
import { useEstadoVisual } from '../../engine/useEstadoVisual';
import { useAveriasProgramadasStore } from '../../store/averiasProgramadasStore';
import type { Vehicle } from '../../types';
import { averiable, type Averiable } from './flotaUtils';

/**
 * Regla de 4 h para un vehículo, al reloj visible del mapa: la misma que usa la tabla de Flota, para
 * el clic derecho del mapa y el botón "Crear avería" de la tarjeta.
 */
export function useAveriable(v: Vehicle | undefined): Averiable | null {
  const { marcaVisibleMs } = useEstadoVisual();
  const programada = useAveriasProgramadasStore((s) => (v ? Boolean(s.pendientes[v.id]) : false));
  return useMemo(
    () => (v ? averiable(v, undefined, marcaVisibleMs, programada) : null),
    [v, marcaVisibleMs, programada],
  );
}
