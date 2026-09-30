package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoSolicitud;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

/**
 * Cuerpo de {@code POST /api/escenarios/{id}/solicitudes}: un cambio "en caliente" a aplicar
 * sobre la ejecución en curso (avería, cambio de velocidad, etc. -- ver {@link TipoSolicitud}).
 */
public record ProgramarSolicitudRequestDTO(
        @NotNull(message = "El instante simulado en que debe aplicarse el cambio es obligatorio") Instant tiempoSimulado,
        @NotNull(message = "El tipo de solicitud es obligatorio") TipoSolicitud tipoSolicitud,
        @NotBlank(message = "La entidad objetivo es obligatoria") String entidadObjetivo,
        @NotBlank(message = "El valor nuevo es obligatorio") String valorNuevo) {
}
