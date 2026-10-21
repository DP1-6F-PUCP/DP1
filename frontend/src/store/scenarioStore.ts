import { create } from 'zustand';
import { EjecucionEscenarioDTO, TipoEscenarioBackend } from '../types/backend';

interface ScenarioState {
  ejecucion: EjecucionEscenarioDTO | null;
  setEjecucion: (ejecucion: EjecucionEscenarioDTO | null) => void;
  selectedScenarioType: TipoEscenarioBackend;
  setSelectedScenarioType: (tipo: TipoEscenarioBackend) => void;
  /** Milisegundos epoch de fechaInicioSimulada, o null si no hay ejecucion activa. */
  scenarioStartMs: () => number | null;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  ejecucion: null,
  setEjecucion: (ejecucion) => set({ ejecucion }),
  selectedScenarioType: 'DIA_A_DIA',
  setSelectedScenarioType: (selectedScenarioType) => set({ selectedScenarioType }),
  scenarioStartMs: () => {
    const fecha = get().ejecucion?.fechaInicioSimulada;
    if (!fecha) return null;
    const ms = Date.parse(fecha);
    return Number.isFinite(ms) ? ms : null;
  },
}));
