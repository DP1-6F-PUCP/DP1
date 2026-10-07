package com.paqrap.backend.dto;

import java.time.Instant;

/**
 * Representación de {@link com.paqrap.simulador.EjecucionEscenario} para la API, per 65.std.api 5.3.
 *
 * @param sa minutos reales entre lotes de planificación
 * @param k razón de compresión tiempo-real:tiempo-simulado -- con {@code horasAvance=(sa/60)*k}
 *         repartido en {@code sa} minutos reales por lote, se simplifica exactamente a "k segundos
 *         simulados por segundo real", independiente de {@code sa}. El frontend lo usa para
 *         extrapolar en tiempo real la posición de cada vehículo entre lotes.
 */
public record EjecucionEscenarioDTO(String idEjecucion, String tipoEscenario, String estado, Instant fechaInicio,
        Instant fechaInicioSimulada, float sa, float k) {
}
