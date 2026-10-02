import { Point, Warehouse, BlockedStreet } from '../types';

export const GRID_WIDTH_KM = 70;
export const GRID_HEIGHT_KM = 50;

export const INITIAL_WAREHOUSES: Warehouse[] = [
  {
    id: 'central',
    name: 'Almacén Central',
    shortName: 'Central',
    code: 'HUB-2714',
    coords: { x: 27, y: 14 },
    capacity: Infinity,
    currentStock: 1000,
    inTransit: 85,
    dispatchRatePerHour: 140,
    color: '#3b82f6', // blue
  },
  {
    id: 'northwest',
    name: 'Intermedio Nor-Oeste',
    shortName: 'Nor-Oeste',
    code: 'SUB-1238',
    coords: { x: 12, y: 38 },
    capacity: 1000,
    currentStock: 1000, // Lleno al iniciar el turno (100%)
    inTransit: 42,
    dispatchRatePerHour: 80,
    color: '#06b6d4', // cyan
  },
  {
    id: 'east',
    name: 'Intermedio Este',
    shortName: 'Este',
    code: 'SUB-5727',
    coords: { x: 57, y: 27 },
    capacity: 1000,
    currentStock: 1000, // Lleno al iniciar el turno (100%)
    inTransit: 58,
    dispatchRatePerHour: 95,
    color: '#8b5cf6', // purple/indigo
  },
];

export const INITIAL_BLOCKED_STREETS: BlockedStreet[] = [
  {
    id: 'block-1',
    name: 'Av. Circunvalación Este (x=45, y=16..24)',
    start: { x: 45, y: 16 },
    end: { x: 45, y: 24 },
    orientation: 'vertical',
    severity: 'critical',
    reason: 'Repavimentación troncal y obras de colector',
    reportedTime: '06:30',
  },
  {
    id: 'block-2',
    name: 'Calle 20 Corredor Central (y=20, x=22..28)',
    start: { x: 22, y: 20 },
    end: { x: 28, y: 20 },
    orientation: 'horizontal',
    severity: 'high',
    reason: 'Accidente múltiple y peritaje policial',
    reportedTime: '07:15',
  },
  {
    id: 'block-3',
    name: 'Eje 38 Conexión NW (y=38, x=25..31)',
    start: { x: 25, y: 38 },
    end: { x: 31, y: 38 },
    orientation: 'horizontal',
    severity: 'medium',
    reason: 'Falla en semaforización masiva y corte de cableado',
    reportedTime: '08:00',
  },
  {
    id: 'block-4',
    name: 'Bulevar Perimetral Norte (y=46, x=14..20)',
    start: { x: 14, y: 46 },
    end: { x: 20, y: 46 },
    orientation: 'horizontal',
    severity: 'medium',
    reason: 'Manifestación cívica y desvío de tránsito',
    reportedTime: '08:45',
  },
  {
    id: 'block-5',
    name: 'Troncal Portuaria Sur (y=6, x=46..52)',
    start: { x: 46, y: 6 },
    end: { x: 52, y: 6 },
    orientation: 'horizontal',
    severity: 'high',
    reason: 'Rotura de tubería matriz de agua potable',
    reportedTime: '09:10',
  },
];

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
