package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

/**
 * Cuerpo de {@code POST /api/escenarios}.
 *
 * @param fechaInicioSimulada instante simulado desde el que arranca el escenario; opcional --
 *         si se omite, se usa el instante real del servidor (comportamiento previo). Necesario
 *         para escenarios que no tiene sentido arrancar "ahora", como {@code CINCO_DIAS} sobre
 *         un período histórico específico de los datos oficiales del curso.
 */
public record SeleccionarEscenarioRequestDTO(
        @NotNull(message = "El tipo de escenario es obligatorio") TipoEscenario tipo,
        Instant fechaInicioSimulada) {
}
