import { VehicleType, BreakdownType } from '../types';

// SystemConfig/INITIAL_CONFIG ya no se hardcodea aqui -- la configuracion operativa real viene
// de GET /api/configuracion (ver Fase A/B). Los helpers de abajo (codigos de vehiculo, formateo
// de fechas simuladas, reglas de averia) son logica pura reutilizable, no datos de mentrada.

export function getVehicleTypePrefix(type: VehicleType): 'TA' | 'TB' | 'TM' {
  switch (type) {
    case 'car':
      return 'TA';
    case 'bicycle':
      return 'TB';
    case 'motorcycle':
      return 'TM';
  }
}

export function formatVehicleCode(type: VehicleType, correlative: number): string {
  const prefix = getVehicleTypePrefix(type);
  const nn = String(correlative).padStart(2, '0');
  return `${prefix}${nn}`;
}

/**
 * Determina la jornada laboral de 8 horas según la hora simulada:
 * - 07:00 a 14:59 -> Primera Jornada (07:00 - 15:00)
 * - 15:00 a 22:59 -> Segunda Jornada (15:00 - 23:00)
 * - 23:00 a 06:59 -> Tercera Jornada (23:00 - 07:00)
 */
export function getShiftFromDate(date: Date): {
  shift: 'Primera Jornada' | 'Segunda Jornada' | 'Tercera Jornada';
  schedule: string;
} {
  const hours = date.getHours();
  if (hours >= 7 && hours < 15) {
    return { shift: 'Primera Jornada', schedule: '07:00 - 15:00' };
  } else if (hours >= 15 && hours < 23) {
    return { shift: 'Segunda Jornada', schedule: '15:00 - 23:00' };
  } else {
    return { shift: 'Tercera Jornada', schedule: '23:00 - 07:00' };
  }
}

/**
 * Format simulated time string (HH:MM:SS)
 */
export function formatSimulatedTime(startDate: Date, simMinutes: number): string {
  const d = new Date(startDate.getTime() + simMinutes * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Format simulated date string (DD Mon YYYY)
 */
export function formatSimulatedDate(startDate: Date, dayOffset: number): string {
  const d = new Date(startDate.getTime() + (dayOffset - 1) * 24 * 60 * 60 * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

/**
 * Format exact simulated date given elapsed minutes
 */
export function formatExactSimulatedDate(startDate: Date, simMinutes: number): string {
  const d = new Date(startDate.getTime() + simMinutes * 60 * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

/**
 * Format date for HTML5 <input type="date"> (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format simulation end date (exact +5 days from startDate)
 */
export function formatSimulatedEndDate(startDate: Date): string {
  const end = new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000);
  const day = String(end.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[end.getMonth()];
  const year = end.getFullYear();
  const hh = String(end.getHours()).padStart(2, '0');
  const mm = String(end.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

/**
 * Retorna el final del siguiente turno respecto a la fecha simulada dada.
 * Jornadas:
 * - Primera Jornada: 07:00 a 15:00
 * - Segunda Jornada: 15:00 a 23:00
 * - Tercera Jornada: 23:00 a 07:00
 */
export function getNextShiftEnd(date: Date): Date {
  const h = date.getHours();
  const nextEnd = new Date(date);
  nextEnd.setMinutes(0, 0, 0);

  if (h >= 7 && h < 15) {
    // Primera Jornada (07:00 - 15:00).
    // Siguiente turno: Segunda Jornada (15:00 - 23:00). Termina a las 23:00 del mismo día.
    nextEnd.setHours(23);
    return nextEnd;
  } else if (h >= 15 && h < 23) {
    // Segunda Jornada (15:00 - 23:00).
    // Siguiente turno: Tercera Jornada (23:00 - 07:00). Termina a las 07:00 del día siguiente.
    nextEnd.setDate(nextEnd.getDate() + 1);
    nextEnd.setHours(7);
    return nextEnd;
  } else {
    // Tercera Jornada (23:00 - 07:00).
    // Siguiente turno: Primera Jornada (07:00 - 15:00). Termina a las 15:00.
    if (h >= 23) {
      nextEnd.setDate(nextEnd.getDate() + 1);
      nextEnd.setHours(15);
    } else {
      nextEnd.setHours(15);
    }
    return nextEnd;
  }
}

/**
 * Calcula los parámetros operativos de una avería según su tipo (1, 2 o 3)
 * - Tipo 1: No disponible por 2 horas. Solución rápida en sitio (llanta desinflada).
 * - Tipo 2: No disponible hasta final del siguiente turno. Permanece máx 4h en sitio y se traslada al Almacén Central.
 * - Tipo 3: No disponible por al menos 2 días por mantenimiento y retorna en turno 15:00 a 23:00. Permanece máx 4h en sitio y se traslada al Almacén Central.
 */
export function calculateBreakdownParameters(
  type: BreakdownType,
  startMinute: number,
  startDate: Date,
  customReason?: string
): {
  type: BreakdownType;
  typeName: string;
  reason: string;
  maxSiteStayMinutes: number;
  returnToOperationMinute: number;
  returnShiftDescription: string;
} {
  const curSimDate = new Date(startDate.getTime() + startMinute * 60 * 1000);

  if (type === 1) {
    const returnMinute = startMinute + 120; // 2 horas de no disponibilidad
    return {
      type: 1,
      typeName: 'Avería Tipo 1 (Menor)',
      reason: customReason || 'Neumático desinflado (solución en sitio en 2h)',
      maxSiteStayMinutes: 120,
      returnToOperationMinute: returnMinute,
      returnShiftDescription: 'Retorno en sitio tras 2 horas',
    };
  } else if (type === 2) {
    const nextShiftEndDate = getNextShiftEnd(curSimDate);
    const returnMinute = Math.round(
      (nextShiftEndDate.getTime() - startDate.getTime()) / (60 * 1000)
    );

    return {
      type: 2,
      typeName: 'Avería Tipo 2 (Intermedia)',
      reason: customReason || 'Rotura de faja/cadena del sistema de transmisión',
      maxSiteStayMinutes: 240, // Permanece máx 4 horas en el lugar
      returnToOperationMinute: Math.max(startMinute + 240, returnMinute),
      returnShiftDescription: `Retorno en Almacén Central al fin del siguiente turno (${formatExactSimulatedDate(startDate, returnMinute)} ${formatSimulatedTime(startDate, returnMinute)})`,
    };
  } else {
    // Tipo 3: no disponible por al menos 2 días (48 horas) y retorna en turno 15:00 a 23:00
    const minMaintenanceDate = new Date(curSimDate.getTime() + 48 * 60 * 60 * 1000);
    const returnDate = new Date(minMaintenanceDate);
    const h = returnDate.getHours();

    if (h < 15) {
      returnDate.setHours(15, 0, 0, 0);
    } else if (h >= 23) {
      returnDate.setDate(returnDate.getDate() + 1);
      returnDate.setHours(15, 0, 0, 0);
    } else {
      // Ya cae dentro de la franja 15:00-23:00
      returnDate.setMinutes(0, 0, 0);
    }

    const returnMinute = Math.round(
      (returnDate.getTime() - startDate.getTime()) / (60 * 1000)
    );

    return {
      type: 3,
      typeName: 'Avería Tipo 3 (Mayor)',
      reason: customReason || 'Falla mayor en motor / mantenimiento general (≥ 2 días)',
      maxSiteStayMinutes: 240, // Permanece máx 4 horas en el lugar
      returnToOperationMinute: Math.max(startMinute + 240, returnMinute),
      returnShiftDescription: `Retorno en Almacén Central en turno 15:00-23:00 (${formatExactSimulatedDate(startDate, returnMinute)} ${formatSimulatedTime(startDate, returnMinute)})`,
    };
  }
}

