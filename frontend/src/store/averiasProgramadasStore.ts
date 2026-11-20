import { create } from 'zustand';
import type { BreakdownType } from '../types';

/**
 * Averías pedidas por el operador que el backend todavía no aplicó: la solicitud se atiende al
 * cerrar el siguiente lote, así que entre el aviso "programada" y el vehículo averiado en el mapa
 * pasan varios segundos sin señal. Mientras tanto el vehículo se marca como "avería programada"
 * (tooltip del mapa y tarjeta del panel). Se limpia cuando el vehículo llega como averiado al
 * instante visible, o tras TOPE_MS (por si el backend no la aplicó), o al cambiar de ejecución.
 */
export const TOPE_AVERIA_PROGRAMADA_MS = 5 * 60_000;

export interface AveriaProgramada {
  tipo: BreakdownType;
  /** Hora real (Date.now()) en que se programó. */
  desdeMs: number;
}

interface Estado {
  pendientes: Record<string, AveriaProgramada>;
  programar: (vehicleId: string, tipo: BreakdownType) => void;
  quitar: (vehicleIds: string[]) => void;
  limpiar: () => void;
}

export const useAveriasProgramadasStore = create<Estado>((set) => ({
  pendientes: {},
  programar: (vehicleId, tipo) =>
    set((s) => ({ pendientes: { ...s.pendientes, [vehicleId]: { tipo, desdeMs: Date.now() } } })),
  quitar: (vehicleIds) =>
    set((s) => {
      if (!vehicleIds.some((id) => id in s.pendientes)) return s;
      const pendientes = { ...s.pendientes };
      vehicleIds.forEach((id) => delete pendientes[id]);
      return { pendientes };
    }),
  limpiar: () => set({ pendientes: {} }),
}));
