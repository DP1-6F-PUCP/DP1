import type { Point } from '../types/route';

/** Identifica un trazado, para no redibujar una línea cuyo camino no cambió. */
export const routeLineKey = (path: Point[]) => path.map((p) => `${p.x},${p.y}`).join(';');

/**
 * Desfase de un punteado para que quede fijo sobre el mapa. SVG lo ancla al inicio de la línea, y
 * aquí el inicio es el vehículo: al avanzar, el patrón se desliza con él y, a la velocidad de la
 * simulación, se ve como un parpadeo. Fijándolo a la distancia hasta el destino, cada raya se queda
 * en su sitio y solo desaparece cuando el vehículo la alcanza.
 */
export function fixedDashOffset(path: Point[], pixelsPerUnit: number, dashArray: string): number | null {
  const period = dashArray.split(/[\s,]+/).map(Number).reduce((sum, n) => sum + n, 0);
  if (!(period > 0)) return null;
  let units = 0;
  for (let i = 1; i < path.length; i++) {
    units += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  }
  return (period - (units * pixelsPerUnit) % period) % period;
}
