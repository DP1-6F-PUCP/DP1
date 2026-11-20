import { create } from 'zustand';

/**
 * Cortes de los semáforos de la interfaz (Configuración → Apariencia). Son preferencias de
 * visualización: viven en este navegador y no cambian lo que decide el planificador. Todo color o
 * nivel que dependa de estos cortes debe leerlos de aquí (nunca números fijos en el código).
 */
export interface Umbrales {
  /** Stock de un almacén intermedio, %: rojo < bajo ≤ ámbar < alto ≤ verde. */
  almacenBajo: number;
  almacenAlto: number;
  /** Carga a bordo de un vehículo, %: baja < media ≤ media < alta ≤ alta. */
  cargaMedia: number;
  cargaAlta: number;
  /** Llenado de la flota, %: verde < alta ≤ ámbar < saturada ≤ rojo. */
  flotaAlta: number;
  flotaSaturada: number;
  /** Pedido pendiente "en riesgo" (ámbar en pines, alertas e Indicadores) cuando faltan estos
   * minutos o menos para su plazo. Rojo = vencido; verde = a tiempo. */
  riesgoMinutos: number;
}

export const UMBRALES_DEFAULT: Umbrales = {
  almacenBajo: 30,
  almacenAlto: 65,
  cargaMedia: 33,
  cargaAlta: 66,
  flotaAlta: 65,
  flotaSaturada: 85,
  riesgoMinutos: 60,
};

const CLAVE = 'paqrap.umbrales';

/** Errores por campo (vacío = válido): cada par debe quedar ordenado y dentro de 1..100. */
export function validarUmbrales(u: Umbrales): Partial<Record<keyof Umbrales, string>> {
  const e: Partial<Record<keyof Umbrales, string>> = {};
  const pct = (k: keyof Umbrales) => {
    if (!Number.isFinite(u[k]) || u[k] < 1 || u[k] > 100) e[k] = 'Entre 1 y 100 %';
  };
  (['almacenBajo', 'almacenAlto', 'cargaMedia', 'cargaAlta', 'flotaAlta', 'flotaSaturada'] as const).forEach(pct);
  const orden = (menor: keyof Umbrales, mayor: keyof Umbrales) => {
    if (!e[menor] && !e[mayor] && u[menor] >= u[mayor]) e[mayor] = `Debe ser mayor que ${u[menor]} %`;
  };
  orden('almacenBajo', 'almacenAlto');
  orden('cargaMedia', 'cargaAlta');
  orden('flotaAlta', 'flotaSaturada');
  if (!Number.isFinite(u.riesgoMinutos) || u.riesgoMinutos < 1 || u.riesgoMinutos > 24 * 60) {
    e.riesgoMinutos = 'Entre 1 y 1440 min';
  }
  return e;
}

const leer = (): Umbrales => {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) {
      // Solo las claves conocidas (una versión anterior guardaba también avisoMinutos).
      const guardado = JSON.parse(raw) as Partial<Umbrales>;
      const u = Object.fromEntries(
        (Object.keys(UMBRALES_DEFAULT) as (keyof Umbrales)[]).map((k) => [k, guardado[k] ?? UMBRALES_DEFAULT[k]]),
      ) as unknown as Umbrales;
      if (Object.keys(validarUmbrales(u)).length === 0) return u;
    }
  } catch {
    // sin storage o dato corrupto: valores por defecto
  }
  return UMBRALES_DEFAULT;
};

interface EstadoUmbrales {
  umbrales: Umbrales;
  guardar: (u: Umbrales) => void;
}

export const useUmbralesStore = create<EstadoUmbrales>((set) => ({
  umbrales: leer(),
  guardar: (umbrales) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(umbrales));
    } catch {
      // sin storage: solo dura la sesión
    }
    set({ umbrales });
  },
}));

/** Para funciones fuera de React (utils). Los componentes usan useUmbrales() para re-renderizar. */
export const umbrales = (): Umbrales => useUmbralesStore.getState().umbrales;
export const useUmbrales = (): Umbrales => useUmbralesStore((s) => s.umbrales);
