package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoSolicitud;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Un ajuste de configuración a aplicar ANTES de que arranque el ciclo periódico de un escenario
 * nuevo (ver {@code SeleccionarEscenarioRequestDTO.ajustesIniciales}) -- mismo catálogo de
 * {@link TipoSolicitud} que los cambios "en caliente" ({@code POST .../solicitudes}), pero sin
 * {@code tiempoSimulado}: todos se aplican en el instante de inicio del escenario, antes del
 * primer lote de planificación.
 */
public record AjusteInicialDTO(
        @NotNull(message = "El tipo de ajuste es obligatorio") TipoSolicitud tipoSolicitud,
        @NotBlank(message = "La entidad objetivo es obligatoria") String entidadObjetivo,
        @NotBlank(message = "El valor nuevo es obligatorio") String valorNuevo) {
}
