package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Representación de un {@link com.paqrap.simulador.EventoSimulacion} para el visualizador.
 *
 * <p>{@code descripcion} y {@code pedidoId} se agregaron para que este mismo DTO pueda usarse
 * como base de las alertas que pide el frontend (bloqueos, averías) — sin ellos, un evento de
 * incidencia no traía ningún mensaje legible para mostrar al usuario.
 */
public record EventoDTO(LocalDateTime instante, String tipo, String vehiculoId, int x, int y, String pedidoId,
        String descripcion) {
}
