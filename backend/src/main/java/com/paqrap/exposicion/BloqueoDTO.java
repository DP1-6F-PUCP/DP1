package com.paqrap.exposicion;

import java.time.LocalDateTime;
import java.util.List;

/** Representación de un {@link com.paqrap.dominio.Bloqueo} para el visualizador. */
public record BloqueoDTO(List<String> secuenciaNodos, LocalDateTime fechaInicio, LocalDateTime fechaFin,
        boolean vigente) {
}
