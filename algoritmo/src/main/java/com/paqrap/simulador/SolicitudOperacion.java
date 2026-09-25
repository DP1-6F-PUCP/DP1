package com.paqrap.simulador;

import java.time.LocalDateTime;

/**
 * Cambio de configuración "en caliente" encolado en {@link OrquestadorOperacion}, para aplicarse
 * cuando el reloj simulado alcance {@code tiempoSimuladoProgramado}.
 *
 * @param tiempoSimuladoProgramado momento simulado en que debe aplicarse el cambio
 * @param tipoSolicitud naturaleza del cambio
 * @param entidadObjetivo identificador de la entidad afectada (id de unidad, de almacén, etc.), según {@code tipoSolicitud}
 * @param valorNuevo valor nuevo a aplicar, en formato textual (se interpreta según {@code tipoSolicitud})
 */
public record SolicitudOperacion(LocalDateTime tiempoSimuladoProgramado, TipoSolicitud tipoSolicitud,
        String entidadObjetivo, String valorNuevo) {
}
