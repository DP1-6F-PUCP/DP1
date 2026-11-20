import { create } from 'zustand';

/**
 * Historial de Reportes. El frontend no guarda historia (cada lote reemplaza al anterior): este
 * store toma una muestra del estado VISIBLE (mismo instante que el mapa) cada PASO_MUESTRA_MS de
 * reloj simulado, por ejecución. Vive en memoria: se pierde al recargar la página.
 *
 * Tope de memoria: al llegar a MAX_MUESTRAS se ralea la mitad más antigua (una de cada dos), así
 * siempre queda toda la ejecución con más detalle en lo reciente. Solo se conservan las últimas
 * MAX_EJECUCIONES ejecuciones.
 */
export const PASO_MUESTRA_MS = 2 * 60_000;
export const MAX_MUESTRAS = 4000;
const MAX_EJECUCIONES = 2;

export interface MuestraFlota {
  enRuta: number;
  refrigerio: number;
  disponible: number;
  fueraServicio: number;
}

export interface Muestra {
  /** Instante simulado visible (ms, convención UTC del backend). */
  t: number;
  recibidos: number;
  entregados: number;
  pendientes: number;
  sinAsignar: number;
  retrasados: number;
  incumplidos: number;
  /** % de entregas a tiempo del backend; null si aún no hay pedidos resueltos. */
  otd: number | null;
  costo: number;
  averias: number;
  flota: MuestraFlota;
  /** Llenado de flota (G01/G02), 0..100. */
  flotaPct: number;
  /** Llenado total de almacenes intermedios (G04), 0..100. */
  almacenesPct: number;
  /** Stock de cada almacén con capacidad finita, % de su capacidad. */
  almacenes: Record<string, number>;
}

interface HistorialState {
  porEjecucion: Record<string, Muestra[]>;
  /** Orden de llegada de las ejecuciones (para descartar las viejas). */
  orden: string[];
  registrar: (idEjecucion: string, m: Muestra) => void;
}

function ralear(lista: Muestra[]): Muestra[] {
  const mitad = Math.floor(lista.length / 2);
  return [...lista.slice(0, mitad).filter((_, i) => i % 2 === 0), ...lista.slice(mitad)];
}

export const useHistorialReportes = create<HistorialState>((set) => ({
  porEjecucion: {},
  orden: [],
  registrar: (id, m) => set((s) => {
    let lista = s.porEjecucion[id] ?? [];
    const ultima = lista[lista.length - 1];
    // El reloj visible retrocede solo si se reinició la reproducción: se empieza de nuevo.
    if (ultima && m.t < ultima.t) lista = [];
    else if (ultima && m.t - ultima.t < PASO_MUESTRA_MS) return s;
    lista = [...lista, m];
    if (lista.length > MAX_MUESTRAS) lista = ralear(lista);
    const orden = s.orden.includes(id) ? s.orden : [...s.orden, id];
    const porEjecucion: Record<string, Muestra[]> = { ...s.porEjecucion, [id]: lista };
    const sobrantes = orden.slice(0, Math.max(0, orden.length - MAX_EJECUCIONES));
    for (const viejo of sobrantes) delete porEjecucion[viejo];
    return { porEjecucion, orden: orden.slice(sobrantes.length) };
  }),
}));

const VACIO: Muestra[] = [];
export const useMuestras = (idEjecucion: string | undefined) =>
  useHistorialReportes((s) => (idEjecucion ? s.porEjecucion[idEjecucion] ?? VACIO : VACIO));
