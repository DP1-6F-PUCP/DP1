import { create } from 'zustand';
import type { AjusteInicial } from '../../types/backend';
import { unirAjustes } from './parametros';

/**
 * Cambios ya enviados EN CALIENTE (POST /escenarios/{id}/solicitudes) que el backend aplica en el
 * próximo lote. GET /api/configuracion recién los refleja después de ese lote (y se cachea 60 s),
 * así que sin esto Configuración volvería a mostrar el valor anterior al reabrirse, como si el
 * cambio se hubiera perdido. Solo en memoria y por ejecución: al cambiar de ejecución se ignoran.
 */
interface ProgramadosState {
  idEjecucion: string | null;
  ajustes: AjusteInicial[];
  agregar: (idEjecucion: string, ajustes: AjusteInicial[]) => void;
}

export const useProgramadosStore = create<ProgramadosState>((set, get) => ({
  idEjecucion: null,
  ajustes: [],
  agregar: (idEjecucion, ajustes) => {
    const previos = get().idEjecucion === idEjecucion ? get().ajustes : [];
    set({ idEjecucion, ajustes: unirAjustes(previos, ajustes) });
  },
}));

const SIN_AJUSTES: AjusteInicial[] = [];

/** Ajustes programados de la ejecución dada (vacío si son de otra). */
export const useAjustesProgramados = (idEjecucion: string | undefined) =>
  useProgramadosStore((s) => (idEjecucion && s.idEjecucion === idEjecucion ? s.ajustes : SIN_AJUSTES));
