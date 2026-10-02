import {
  BlockedStreet,
  Order,
  Point,
  Warehouse,
  PreventiveMaintenanceRecord,
  MaintenanceFileResult,
} from '../types';
import { GRID_HEIGHT_KM, GRID_WIDTH_KM, INITIAL_WAREHOUSES } from './manhattan';

export interface BlockedFileSummary {
  fileName: string;
  totalSegments: number;
  totalPolylines: number;
  monthYear?: string;
  sampleLines: string[];
  errors: string[];
}

export interface OrdersFileSummary {
  fileName: string;
  totalOrders: number;
  totalQuantity: number;
  monthYear?: string;
  sampleLines: string[];
  errors: string[];
}

export interface MaintenanceFileSummary {
  fileName: string;
  totalRecords: number;
  monthsCovered?: string;
  sampleLines: string[];
  errors: string[];
  uniqueVehicles: string[];
}

/**
 * Parses course blocked streets files (aaaamm.bloqueadas / aaaamm.bloqueado.txt)
 * According to Course 1INF54 specifications:
 * - Blockages are identified by pairs of extreme points (nodes) in open polygons.
 * - An open polyline (P1 -> P2 -> P3 ...) forms consecutive blocked segments.
 * - Format can include planning intervals or node sequences:
 *   e.g. "01d00h00m-05d12h00m:12,15,12,20,15,20"
 *   or "12,15,12,20"
 *   or "12,15,12,20,18,20"
 */
export function parseBlockedStreetsFile(
  content: string,
  fileName: string = '202609.bloqueadas'
): { blockages: BlockedStreet[]; summary: BlockedFileSummary } {
  const lines = content.split(/\r?\n/);
  const blockages: BlockedStreet[] = [];
  const errors: string[] = [];
  const sampleLines: string[] = [];
  let polylineCount = 0;

  // Extract month/year from file name like 202609.bloqueadas
  const matchName = fileName.match(/(\d{4})(\d{2})/);
  const monthYear = matchName ? `${matchName[1]}-${matchName[2]}` : undefined;

  let segmentIdCounter = 1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) {
      continue;
    }

    if (sampleLines.length < 5) {
      sampleLines.push(rawLine);
    }

    // Try parsing: [timeInterval:]x1,y1,x2,y2[,x3,y3...]
    let timeRangeText = 'Planificado Municipal';
    let coordsPart = rawLine;

    if (rawLine.includes(':')) {
      const parts = rawLine.split(':');
      timeRangeText = parts[0].trim();
      coordsPart = parts.slice(1).join(':').trim();
    }

    // Extract all numbers
    const numbers = coordsPart
      .split(/[,;\s\t-]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => !isNaN(n));

    if (numbers.length < 4 || numbers.length % 2 !== 0) {
      errors.push(`Línea ${lineIndex + 1}: Formato inválido o coordenadas impares ("${rawLine}")`);
      continue;
    }

    // Nodes in the open polygon
    const nodes: Point[] = [];
    for (let i = 0; i < numbers.length; i += 2) {
      nodes.push({
        x: Math.max(0, Math.min(GRID_WIDTH_KM, Math.round(numbers[i]))),
        y: Math.max(0, Math.min(GRID_HEIGHT_KM, Math.round(numbers[i + 1]))),
      });
    }

    polylineCount++;
    const polyId = `poly-${polylineCount}`;

    // Create segments for open polyline: (nodes[0]->nodes[1]), (nodes[1]->nodes[2]), etc.
    for (let i = 0; i < nodes.length - 1; i++) {
      const p1 = nodes[i];
      const p2 = nodes[i + 1];

      // Determine orientation (horizontal or vertical, defaulting if diagonal)
      const isVertical = Math.abs(p2.y - p1.y) >= Math.abs(p2.x - p1.x);

      blockages.push({
        id: `blk-${segmentIdCounter++}`,
        name: `Bloqueo Planificado (${p1.x},${p1.y}) ➔ (${p2.x},${p2.y})`,
        start: p1,
        end: p2,
        orientation: isVertical ? 'vertical' : 'horizontal',
        severity: 'critical',
        reason: `Cierre vial planificado por municipio (${timeRangeText})`,
        reportedTime: timeRangeText.includes('d') ? timeRangeText : '07:00',
      });
    }
  }

  return {
    blockages,
    summary: {
      fileName,
      totalSegments: blockages.length,
      totalPolylines: polylineCount,
      monthYear,
      sampleLines,
      errors: errors.slice(0, 5),
    },
  };
}

/**
 * Parses course historical / projected orders files (ventas2026mm)
 * According to Course 1INF54 specifications:
 * Format: ##d##h##m:posX,posY,cIdCliente,qq,hl
 * Example: 11d13h31m:45,43,c9167,12,36
 * - ##d##h##m: day, hour and minute when order arrived
 * - posX,posY: delivery grid coordinates
 * - cIdCliente: client identifier (e.g. c9167)
 * - qq: quantity of product units P
 * - hl: delivery limit hours (lead time / SLA in hours)
 */
export function parseOrdersFile(
  content: string,
  fileName: string = 'ventas202609',
  warehouses: Warehouse[] = INITIAL_WAREHOUSES
): { orders: Order[]; summary: OrdersFileSummary } {
  const lines = content.split(/\r?\n/);
  const orders: Order[] = [];
  const errors: string[] = [];
  const sampleLines: string[] = [];
  let totalQuantity = 0;

  const matchName = fileName.match(/(\d{4})(\d{2})/);
  const monthYear = matchName ? `${matchName[1]}-${matchName[2]}` : undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) {
      continue;
    }

    if (sampleLines.length < 5) {
      sampleLines.push(rawLine);
    }

    // Regex for: ##d##h##m:posX,posY,cIdCliente,qq,hl
    // Also supports flexible separators (space, tab, comma)
    const regex = /^(\d+)d(\d+)h(\d+)m\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*([^,]+)\s*,\s*(\d+)\s*,\s*(\d+)/i;
    const match = rawLine.match(regex);

    if (!match) {
      // Fallback parser if spaces or slight variance
      const parts = rawLine.split(':');
      if (parts.length >= 2) {
        const timePart = parts[0].trim();
        const dataParts = parts[1].split(',').map((p) => p.trim());
        const timeMatch = timePart.match(/(\d+)d(\d+)h(\d+)m/i);
        if (timeMatch && dataParts.length >= 5) {
          const day = parseInt(timeMatch[1], 10);
          const hour = parseInt(timeMatch[2], 10);
          const minute = parseInt(timeMatch[3], 10);
          const posX = parseInt(dataParts[0], 10);
          const posY = parseInt(dataParts[1], 10);
          const clientId = dataParts[2];
          const qq = parseInt(dataParts[3], 10);
          const hl = parseInt(dataParts[4], 10);

          const createdMinute = ((day - 1) * 24 * 60) + (hour * 60) + minute;
          const deadlineMinute = createdMinute + (hl * 60);
          totalQuantity += qq;

          // Closest warehouse
          const originWh = findClosestWarehouse({ x: posX, y: posY }, warehouses);

          orders.push({
            id: `pkg-${clientId}-${day}d${hour}h`,
            code: `ORD-${clientId.toUpperCase()}`,
            warehouseOriginId: originWh ? originWh.id : 'central',
            destination: {
              x: Math.max(0, Math.min(GRID_WIDTH_KM, posX)),
              y: Math.max(0, Math.min(GRID_HEIGHT_KM, posY)),
            },
            createdMinute,
            deadlineMinute,
            status: 'on_time',
            urgency: hl <= 12 ? 'priority' : 'normal',
            clientId,
            quantity: qq,
            slaHours: hl,
          });
          continue;
        }
      }

      errors.push(`Línea ${lineIndex + 1}: Formato esperado "##d##h##m:posX,posY,cIdCliente,qq,hl" ("${rawLine}")`);
      continue;
    }

    const day = parseInt(match[1], 10);
    const hour = parseInt(match[2], 10);
    const minute = parseInt(match[3], 10);
    const posX = parseInt(match[4], 10);
    const posY = parseInt(match[5], 10);
    const clientId = match[6].trim();
    const qq = parseInt(match[7], 10);
    const hl = parseInt(match[8], 10);

    const createdMinute = ((day - 1) * 24 * 60) + (hour * 60) + minute;
    const deadlineMinute = createdMinute + (hl * 60);
    totalQuantity += qq;

    const originWh = findClosestWarehouse({ x: posX, y: posY }, warehouses);

    orders.push({
      id: `pkg-${clientId}-${day}d${hour}h`,
      code: `ORD-${clientId.toUpperCase()}`,
      warehouseOriginId: originWh ? originWh.id : 'central',
      destination: {
        x: Math.max(0, Math.min(GRID_WIDTH_KM, posX)),
        y: Math.max(0, Math.min(GRID_HEIGHT_KM, posY)),
      },
      createdMinute,
      deadlineMinute,
      status: 'on_time',
      urgency: hl <= 12 ? 'priority' : 'normal',
      clientId,
      quantity: qq,
      slaHours: hl,
    });
  }

  return {
    orders,
    summary: {
      fileName,
      totalOrders: orders.length,
      totalQuantity,
      monthYear,
      sampleLines,
      errors: errors.slice(0, 5),
    },
  };
}

function findClosestWarehouse(dest: Point, warehouses?: Warehouse[]): Warehouse {
  const list = warehouses && warehouses.length > 0 ? warehouses : INITIAL_WAREHOUSES;
  let closest = list[0] || INITIAL_WAREHOUSES[0];
  let minDist = Infinity;
  for (const wh of list) {
    if (!wh || !wh.coords) continue;
    const dist = Math.abs(dest.x - wh.coords.x) + Math.abs(dest.y - wh.coords.y);
    if (dist < minDist) {
      minDist = dist;
      closest = wh;
    }
  }
  return closest || INITIAL_WAREHOUSES[0];
}

/**
 * Sample dataset generator compliant with course 1INF54 format
 */
export const SAMPLE_BLOCKAGES_FILE_CONTENT = `# Archivo de calles bloqueadas planificadas (Polígonos abiertos)
# Formato: [intervalo:]x1,y1,x2,y2,...
01d00h00m-15d23h59m:45,16,45,24
01d00h00m-30d23h59m:22,20,28,20
03d08h00m-10d18h00m:25,38,31,38
05d00h00m-20d23h59m:14,46,20,46
08d06h00m-28d22h00m:46,6,52,6
12d00h00m-18d23h59m:35,12,35,18,40,18
15d07h00m-25d20h00m:18,28,18,34`;

export const SAMPLE_ORDERS_FILE_CONTENT = `# Archivo histórico/proyectado de ventas y envíos
# Formato: ##d##h##m:posX,posY,cIdCliente,qq,hl
01d07h15m:28,22,c1042,8,24
01d08h05m:15,35,c8319,14,36
01d08h30m:52,29,c2491,6,18
01d09h12m:33,18,c9041,12,24
01d10h00m:19,41,c3150,5,36
01d11h25m:48,22,c7721,10,24
01d12h40m:22,14,c1198,15,48
01d13h31m:45,43,c9167,12,36
01d14h10m:11,32,c4832,7,24
01d15h45m:57,25,c6204,18,36
01d16h20m:38,28,c5512,9,24
01d17h05m:24,20,c3984,11,48
02d08h15m:16,39,c7129,6,24
02d09h30m:44,30,c8411,16,36
02d11h00m:50,15,c2019,8,24
02d13h20m:29,26,c6372,13,36
02d15h10m:13,30,c9945,5,18
03d08h45m:36,40,c4180,10,24
03d10h15m:42,19,c5293,7,36
03d12h50m:21,18,c8024,14,24
03d14h30m:54,32,c1739,9,36
04d09h10m:18,44,c3392,12,48
04d11h20m:49,27,c6615,8,24
04d14h00m:31,23,c9481,15,36
05d08h30m:25,36,c2847,11,24
05d10h40m:58,21,c7530,6,18
05d13h15m:39,33,c1664,13,36
05d15h50m:14,25,c8890,7,24`;

/**
 * Parses preventive maintenance file (mant.preventivo.m1.m2)
 * According to specifications:
 * File name format: mant.preventivo.m1.m2 (e.g. mant.preventivo.09.10)
 * Line format: aaaammdd:TTNN
 * Example: 20260905:TA01
 */
export function parseMaintenanceFile(
  content: string,
  fileName: string = 'mant.preventivo.09.10'
): { records: PreventiveMaintenanceRecord[]; summary: MaintenanceFileSummary } {
  const lines = content.split(/\r?\n/);
  const records: PreventiveMaintenanceRecord[] = [];
  const errors: string[] = [];
  const sampleLines: string[] = [];
  const vehicleSet = new Set<string>();

  // Extract months from name if present: mant.preventivo.09.10 or mant.preventivo.2026.09.10
  const matchMonths = fileName.match(/(\d{2})\.(\d{2})$/);
  const monthsCovered = matchMonths ? `${matchMonths[1]} - ${matchMonths[2]}` : undefined;

  let counter = 1;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) {
      continue;
    }

    if (sampleLines.length < 5) {
      sampleLines.push(rawLine);
    }

    // Pattern: aaaammdd:TTNN (e.g. 20260905:TA01)
    const regex = /^(\d{4})(\d{2})(\d{2})\s*:\s*([A-Za-z0-9_-]{3,6})/i;
    const match = rawLine.match(regex);

    if (!match) {
      const parts = rawLine.split(':');
      if (parts.length >= 2) {
        const dateRaw = parts[0].replace(/\D/g, '');
        const codeRaw = parts[1].trim().toUpperCase();
        if (dateRaw.length === 8 && codeRaw.length >= 3) {
          const year = parseInt(dateRaw.substring(0, 4), 10);
          const month = parseInt(dateRaw.substring(4, 6), 10);
          const day = parseInt(dateRaw.substring(6, 8), 10);
          const dateKey = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
          const dateFormatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          vehicleSet.add(codeRaw);
          records.push({
            id: `mant-${counter++}`,
            year,
            month,
            day,
            dateKey,
            dateFormatted,
            vehicleCode: codeRaw,
            sourceFileName: fileName,
          });
          continue;
        }
      }

      errors.push(`Línea ${i + 1}: Formato esperado aaaammdd:TTNN ("${rawLine}")`);
      continue;
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const vehicleCode = match[4].trim().toUpperCase();
    const dateKey = `${match[1]}${match[2]}${match[3]}`;
    const dateFormatted = `${match[1]}-${match[2]}-${match[3]}`;

    vehicleSet.add(vehicleCode);
    records.push({
      id: `mant-${counter++}`,
      year,
      month,
      day,
      dateKey,
      dateFormatted,
      vehicleCode,
      sourceFileName: fileName,
    });
  }

  return {
    records,
    summary: {
      fileName,
      totalRecords: records.length,
      monthsCovered,
      sampleLines,
      errors: errors.slice(0, 5),
      uniqueVehicles: Array.from(vehicleSet).sort(),
    },
  };
}

/**
 * Sample official maintenance file content for setiembre y octubre 2026
 */
export const SAMPLE_MAINTENANCE_FILE_CONTENT = `# Archivo oficial de mantenimiento preventivo bimestral
# Formato: aaaammdd:TTNN
20260905:TA01
20260909:TB02
20260914:TM03
20260918:TA04
20260922:TB05
20260927:TM07
20261003:TM01
20261008:TA02
20261012:TB03
20261017:TM05
20261021:TA06
20261026:TB07`;

/**
 * Generates all bimonthly maintenance files to cover the entire period:
 * 01 Ene 2026 hasta 31 Dic 2029 (4 years = 24 bimesters)
 * Following the naming: mant.preventivo.m1.m2
 * And records: aaaammdd:TTNN
 */
export function generateMaintenanceFilesForPeriod(
  startYear = 2026,
  endYear = 2029,
  fleetVehicles: string[] = [
    'TA01', 'TA02', 'TA03', 'TA04', 'TA05', 'TA06',
    'TB01', 'TB02', 'TB03', 'TB04', 'TB05', 'TB06', 'TB07', 'TB08',
    'TM01', 'TM02', 'TM03', 'TM04', 'TM05', 'TM06', 'TM07', 'TM08', 'TM09', 'TM10',
  ]
): MaintenanceFileResult[] {
  const bimesters: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
  ];

  const results: MaintenanceFileResult[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (let bIndex = 0; bIndex < bimesters.length; bIndex++) {
      const [m1, m2] = bimesters[bIndex];
      const m1Str = String(m1).padStart(2, '0');
      const m2Str = String(m2).padStart(2, '0');
      const fileName = `mant.preventivo.${year}.${m1Str}.${m2Str}`;

      const lines: string[] = [
        `# Mantenimiento preventivo ${m1Str}.${m2Str} - Año ${year}`,
        `# Registro: aaaammdd:TTNN`,
      ];

      const records: PreventiveMaintenanceRecord[] = [];
      let recordIdCounter = 1;

      // Distribute fleet units across the two months
      const half = Math.ceil(fleetVehicles.length / 2);
      const m1Vehicles = fleetVehicles.slice(0, half);
      const m2Vehicles = fleetVehicles.slice(half);

      const daysStep = [3, 7, 11, 15, 18, 22, 25, 28];

      m1Vehicles.forEach((veh, idx) => {
        const dayNum = daysStep[idx % daysStep.length];
        const dayStr = String(dayNum).padStart(2, '0');
        const dateKey = `${year}${m1Str}${dayStr}`;
        const dateFormatted = `${year}-${m1Str}-${dayStr}`;
        lines.push(`${dateKey}:${veh}`);
        records.push({
          id: `${fileName}-${recordIdCounter++}`,
          year,
          month: m1,
          day: dayNum,
          dateKey,
          dateFormatted,
          vehicleCode: veh,
          sourceFileName: fileName,
        });
      });

      m2Vehicles.forEach((veh, idx) => {
        const dayNum = daysStep[idx % daysStep.length];
        const dayStr = String(dayNum).padStart(2, '0');
        const dateKey = `${year}${m2Str}${dayStr}`;
        const dateFormatted = `${year}-${m2Str}-${dayStr}`;
        lines.push(`${dateKey}:${veh}`);
        records.push({
          id: `${fileName}-${recordIdCounter++}`,
          year,
          month: m2,
          day: dayNum,
          dateKey,
          dateFormatted,
          vehicleCode: veh,
          sourceFileName: fileName,
        });
      });

      results.push({
        fileName,
        records,
        rawContent: lines.join('\n'),
      });
    }
  }

  return results;
}

export type DetectedFileType = 'blockages' | 'orders' | 'maintenance' | 'unknown';

/**
 * Automatically identifies file type based on file name pattern and content structure
 */
export function detectFileType(fileName: string, content: string): DetectedFileType {
  const lowerName = fileName.toLowerCase();

  // Pattern matching by name
  if (lowerName.includes('bloquea') || lowerName.endsWith('.bloqueadas')) {
    return 'blockages';
  }
  if (lowerName.startsWith('mant.preventivo') || lowerName.includes('mantenimiento')) {
    return 'maintenance';
  }
  if (lowerName.startsWith('ventas') || lowerName.includes('pedidos') || lowerName.includes('orden')) {
    return 'orders';
  }

  // Content-based heuristic inspection
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length > 0) {
    const sample = lines.slice(0, 10);

    // Maintenance check: aaaammdd:TTNN (e.g. 20260905:TA01 or 20261012:TB03)
    if (sample.some((l) => /^\d{8}\s*:\s*[A-Za-z0-9_-]{3,8}$/i.test(l))) {
      return 'maintenance';
    }

    // Orders check: ##d##h##m:posX,posY,cIdCliente,qq,hl
    if (sample.some((l) => /^\d+d\d+h\d+m\s*:\s*\d+\s*,\s*\d+\s*,/i.test(l))) {
      return 'orders';
    }

    // Blockages check: interval or coords: [time:]x1,y1,x2,y2
    if (sample.some((l) => {
      const parts = l.includes(':') ? l.split(':').slice(1).join(':') : l;
      const nums = parts.split(/[,;\s\t-]+/).filter(Boolean);
      return nums.length >= 4 && !isNaN(Number(nums[0])) && !isNaN(Number(nums[1]));
    })) {
      return 'blockages';
    }
  }

  return 'unknown';
}

