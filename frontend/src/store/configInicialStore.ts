import { create } from 'zustand';
import type { AjusteInicial } from '../types/backend';

/**
 * Ajustes de configuración que el usuario guardó en ConfigModal y que todavía no se enviaron al
 * backend. Se envían como `ajustesIniciales` en POST /api/escenarios (ver SeleccionarEscenarioGate)
 * y se limpian cuando el backend acepta el escenario: a partir de ahí ya forman parte de la
 * configuración vigente (GET /api/configuracion), que es estado compartido del servidor.
 *
 * Se persisten en localStorage para no perderlos si se recarga la página antes de iniciar.
 */
const STORAGE_KEY = 'sysmile_ajustes_iniciales';

const leerGuardados = (): AjusteInicial[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistir = (ajustes: AjusteInicial[]) => {
  try {
    if (ajustes.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ajustes));
  } catch {
    // Sin storage disponible los ajustes solo viven en memoria: igual se envían al iniciar.
  }
};

interface ConfigInicialState {
  ajustesPendientes: AjusteInicial[];
  setAjustesPendientes: (ajustes: AjusteInicial[]) => void;
  limpiar: () => void;
}

export const useConfigInicialStore = create<ConfigInicialState>((set) => ({
  ajustesPendientes: leerGuardados(),
  setAjustesPendientes: (ajustes) => {
    persistir(ajustes);
    set({ ajustesPendientes: ajustes });
  },
  limpiar: () => {
    persistir([]);
    set({ ajustesPendientes: [] });
  },
}));
