package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.constraints.NotNull;

/** Cuerpo de {@code POST /api/escenarios}. */
public record SeleccionarEscenarioRequestDTO(
        @NotNull(message = "El tipo de escenario es obligatorio") TipoEscenario tipo) {
}
