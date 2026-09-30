package com.paqrap.backend.dto;

import java.time.Instant;

/** Representación de {@link com.paqrap.simulador.EjecucionEscenario} para la API, per 65.std.api 5.3. */
public record EjecucionEscenarioDTO(String idEjecucion, String tipoEscenario, String estado, Instant fechaInicio,
        Instant fechaInicioSimulada) {
}
