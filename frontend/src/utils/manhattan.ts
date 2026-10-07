import { Point, BlockedStreet } from '../types';

// GRID_WIDTH_KM/GRID_HEIGHT_KM calzan con CiudadDTO.ancho/alto de produccion (70x50, ver
// PaqRapConfig) pero NO se leen reactivamente de GET /api/configuracion -- son constantes de
// modulo usadas directamente dentro de LeafletManhattanMap.tsx (bounds, lineas de grilla), no
// props, asi que mutarlas en caliente no dispararia un re-render de esos efectos. Conectarlas de
// verdad requeriria pasarlas como prop hasta el mapa, no solo leer el DTO -- deuda conocida, sin
// impacto real hoy porque production usa exactamente estos valores. Los almacenes y calles
// bloqueadas YA NO se hardcodean: vienen de GET /api/configuracion y del estado de operacion.
export const GRID_WIDTH_KM = 70;
export const GRID_HEIGHT_KM = 50;

/**
 * Calculates Manhattan distance (L1 norm) between two points
 */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if a vertical/horizontal segment intersects a blocked street
 */
export function isSegmentBlocked(
  p1: Point,
  p2: Point,
  blockedStreets: BlockedStreet[]
): boolean {
  for (const block of blockedStreets) {
    if (block.orientation === 'vertical') {
      // block is on x = block.start.x, from min(y) to max(y)
      const bx = block.start.x;
      const bMinY = Math.min(block.start.y, block.end.y);
      const bMaxY = Math.max(block.start.y, block.end.y);

      // if moving vertically along that same street
      if (p1.x === bx && p2.x === bx) {
        const segMinY = Math.min(p1.y, p2.y);
        const segMaxY = Math.max(p1.y, p2.y);
        if (segMaxY >= bMinY && segMinY <= bMaxY) return true;
      }
      // if moving horizontally crossing bx
      if (p1.y === p2.y) {
        const segMinX = Math.min(p1.x, p2.x);
        const segMaxX = Math.max(p1.x, p2.x);
        if (bx >= segMinX && bx <= segMaxX && p1.y >= bMinY && p1.y <= bMaxY) {
          return true;
        }
      }
    } else {
      // block is horizontal on y = block.start.y, from min(x) to max(x)
      const by = block.start.y;
      const bMinX = Math.min(block.start.x, block.end.x);
      const bMaxX = Math.max(block.start.x, block.end.x);

      // if moving horizontally along that same street
      if (p1.y === by && p2.y === by) {
        const segMinX = Math.min(p1.x, p2.x);
        const segMaxX = Math.max(p1.x, p2.x);
        if (segMaxX >= bMinX && segMinX <= bMaxX) return true;
      }
      // if moving vertically crossing by
      if (p1.x === p2.x) {
        const segMinY = Math.min(p1.y, p2.y);
        const segMaxY = Math.max(p1.y, p2.y);
        if (by >= segMinY && by <= segMaxY && p1.x >= bMinX && p1.x <= bMaxX) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Generate a strict Manhattan path (horizontal then vertical, or vertical then horizontal)
 * avoiding straight lines through known blocked street segments.
 */
export function generateManhattanPath(
  start: Point,
  destination: Point,
  blockedStreets: BlockedStreet[]
): Point[] {
  if (start.x === destination.x && start.y === destination.y) {
    return [{ ...start }];
  }

  // Option 1: Horizontal first, then Vertical: start -> (dest.x, start.y) -> dest
  const cornerHV: Point = { x: destination.x, y: start.y };
  const blockedHV =
    isSegmentBlocked(start, cornerHV, blockedStreets) ||
    isSegmentBlocked(cornerHV, destination, blockedStreets);

  // Option 2: Vertical first, then Horizontal: start -> (start.x, dest.y) -> dest
  const cornerVH: Point = { x: start.x, y: destination.y };
  const blockedVH =
    isSegmentBlocked(start, cornerVH, blockedStreets) ||
    isSegmentBlocked(cornerVH, destination, blockedStreets);

  if (!blockedHV) {
    return [{ ...start }, cornerHV, { ...destination }];
  } else if (!blockedVH) {
    return [{ ...start }, cornerVH, { ...destination }];
  }

  // If both direct corners are blocked, create a detour by shifting 3km parallel
  const detourY = Math.max(2, Math.min(GRID_HEIGHT_KM - 2, start.y + 4));
  return [
    { ...start },
    { x: start.x, y: detourY },
    { x: destination.x, y: detourY },
    { ...destination },
  ];
}
