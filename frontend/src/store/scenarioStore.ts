import { create } from 'zustand';
import { EjecucionEscenarioDTO, TipoEscenarioBackend } from '../types/backend';
import { parseBackendSimulatedTime } from '../utils/backendTime';

interface ScenarioState {
  transicion: 'iniciando' | 'preparando' | 'cerrando' | null;
  setTransicion: (fase: ScenarioState['transicion']) => void;
  ejecucion: EjecucionEscenarioDTO | null;
  playbackStartedAtMs: number | null;
  setEjecucion: (ejecucion: EjecucionEscenarioDTO | null) => void;
  selectedScenarioType: TipoEscenarioBackend;
  setSelectedScenarioType: (tipo: TipoEscenarioBackend) => void;
  /** Milisegundos epoch de fechaInicioSimulada, o null si no hay ejecucion activa. */
  scenarioStartMs: () => number | null;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  transicion: null,
  setTransicion: (transicion) => set({ transicion }),
  ejecucion: null,
  playbackStartedAtMs: null,
  setEjecucion: (ejecucion) => set((state) => ({ ejecucion,
    playbackStartedAtMs: ejecucion?.idEjecucion === state.ejecucion?.idEjecucion
      ? state.playbackStartedAtMs : null })),
  selectedScenarioType: 'DIA_A_DIA',
  setSelectedScenarioType: (selectedScenarioType) => set({ selectedScenarioType }),
  scenarioStartMs: () => {
    const fecha = get().ejecucion?.fechaInicioSimulada;
    if (!fecha) return null;
    const ms = parseBackendSimulatedTime(fecha);
    return Number.isFinite(ms) ? ms : null;
  },
}));
