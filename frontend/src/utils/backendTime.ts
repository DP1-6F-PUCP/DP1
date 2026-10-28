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

export function formatBackendSimulatedTime(
  milliseconds: number,
  includeDate = true,
  includeSeconds = false,
): string {
  const parts = new Intl.DateTimeFormat('es-PE', {
    ...(includeDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h12',
    timeZone: 'UTC',
  }).formatToParts(milliseconds);

  return parts
    .map((part) => (part.type === 'hour' && part.value === '12' ? { ...part, value: '0' } : part))
    .map((part) => part.value)
    .join('');
}
