import { create } from 'zustand';
import { EjecucionEscenarioDTO } from '../types/backend';

interface ScenarioState {
  ejecucion: EjecucionEscenarioDTO | null;
  setEjecucion: (ejecucion: EjecucionEscenarioDTO | null) => void;
  /** Milisegundos epoch de fechaInicioSimulada, o null si no hay ejecucion activa. */
  scenarioStartMs: () => number | null;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  ejecucion: null,
  setEjecucion: (ejecucion) => set({ ejecucion }),
  scenarioStartMs: () => {
    const fecha = get().ejecucion?.fechaInicioSimulada;
    if (!fecha) return null;
    const ms = Date.parse(fecha);
    return Number.isFinite(ms) ? ms : null;
  },
}));
