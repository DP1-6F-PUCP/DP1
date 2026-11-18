/**
 * El backend trata el tiempo simulado como LocalDateTime sin zona, pero los DTOs de entrada
 * (SeleccionarEscenarioRequest.fechaInicioSimulada, ProgramarSolicitudRequest.tiempoSimulado)
 * declaran Instant -- SimulacionController hace LocalDateTime.ofInstant(instant, UTC) para
 * recuperar el mismo valor de reloj. Por eso, para ida y vuelta exacta, el front debe tratar esos
 * strings "naive" como si fueran UTC (agregar 'Z'), no convertir zona horaria real.
 */
export function toBackendInstant(localDateTimeIso: string): string {
  return localDateTimeIso.endsWith('Z') ? localDateTimeIso : `${localDateTimeIso}Z`;
}

/** Interpreta los LocalDateTime simulados del backend con la misma convención UTC que los Instant. */
export function parseBackendSimulatedTime(value: string | null | undefined): number {
  if (value == null) return Number.NaN;
  const milliseconds = Date.parse(toBackendInstant(value));
  return milliseconds;
}

// Crear un Intl.DateTimeFormat es caro y la lista de envíos formatea varias horas por tarjeta.
const simulatedTimeFormats = new Map<string, Intl.DateTimeFormat>();

function simulatedTimeFormat(includeDate: boolean, includeSeconds: boolean): Intl.DateTimeFormat {
  const key = `${includeDate}:${includeSeconds}`;
  let format = simulatedTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('es-PE', {
      ...(includeDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hourCycle: 'h12',
      timeZone: 'UTC',
    });
    simulatedTimeFormats.set(key, format);
  }
  return format;
}

const formato24 = new Map<boolean, Intl.DateTimeFormat>();

/** Hora simulada en formato 24 h ("18/11/2026 15:32"), más corta que la de am/pm. */
export function formatBackendSimulatedTime24(milliseconds: number, includeDate = true): string {
  let format = formato24.get(includeDate);
  if (!format) {
    format = new Intl.DateTimeFormat('es-PE', {
      ...(includeDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    });
    formato24.set(includeDate, format);
  }
  return format.format(milliseconds).replace(',', '');
}

export function formatBackendSimulatedTime(
  milliseconds: number,
  includeDate = true,
  includeSeconds = false,
): string {
  const parts = simulatedTimeFormat(includeDate, includeSeconds).formatToParts(milliseconds);

  return parts
    .map((part) => (part.type === 'hour' && part.value === '12' ? { ...part, value: '0' } : part))
    .map((part) => part.value)
    .join('');
}
