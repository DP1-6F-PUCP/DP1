import { create } from 'zustand';

/**
 * Rangos del semáforo de flota (requisito: rangos configurables). Se expresan como holgura, en
 * minutos simulados, entre el instante actual y el plazo más próximo de los pedidos que lleva el
 * vehículo:
 *  - verde: holgura > riesgoMinutos
 *  - ámbar: retrasoMinutos < holgura <= riesgoMinutos
 *  - rojo:  holgura <= retrasoMinutos (o avería / mantenimiento)
 *
 * Es una preferencia de visualización: vive solo en el navegador, no viaja al backend.
 */
export interface UmbralesSemaforo {
  riesgoMinutos: number;
  retrasoMinutos: number;
}

export const UMBRALES_SEMAFORO_DEFAULT: UmbralesSemaforo = { riesgoMinutos: 180, retrasoMinutos: 60 };

const STORAGE_KEY = 'sysmile_umbrales_semaforo';

const leerGuardados = (): UmbralesSemaforo => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return UMBRALES_SEMAFORO_DEFAULT;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.riesgoMinutos) && Number.isFinite(parsed?.retrasoMinutos)) return parsed;
  } catch {
    // valores por defecto
  }
  return UMBRALES_SEMAFORO_DEFAULT;
};

interface SemaforoState {
  umbrales: UmbralesSemaforo;
  setUmbrales: (umbrales: UmbralesSemaforo) => void;
}

export const useSemaforoStore = create<SemaforoState>((set) => ({
  umbrales: leerGuardados(),
  setUmbrales: (umbrales) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(umbrales));
    } catch {
      // sin storage: solo dura la sesión
    }
    set({ umbrales });
  },
}));
