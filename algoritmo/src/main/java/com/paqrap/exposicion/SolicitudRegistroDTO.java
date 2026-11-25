package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Una solicitud de cambio de la ejecución (ajuste inicial o cambio en caliente), con su resultado.
 *
 * @param estado {@code PROGRAMADA}, {@code APLICADA}, {@code RECHAZADA} (no se aceptó al programarla)
 *         o {@code DESCARTADA} (falló al aplicarla)
 * @param valorAnterior valor vigente al programarla (si se pudo determinar)
 * @param aplicadaEn instante simulado en que se aplicó o descartó
 */
public record SolicitudRegistroDTO(String id, String tipoSolicitud, String entidadObjetivo, String valorAnterior,
        String valorNuevo, LocalDateTime tiempoProgramado, String estado, String detalle, LocalDateTime aplicadaEn) {

    public SolicitudRegistroDTO conResultado(String nuevoEstado, String nuevoDetalle, LocalDateTime instante) {
        return new SolicitudRegistroDTO(id, tipoSolicitud, entidadObjetivo, valorAnterior, valorNuevo, tiempoProgramado,
                nuevoEstado, nuevoDetalle, instante);
    }
}
