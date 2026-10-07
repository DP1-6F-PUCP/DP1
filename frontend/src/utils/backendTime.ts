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
