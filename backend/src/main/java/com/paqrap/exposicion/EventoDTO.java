package com.paqrap.exposicion;

import java.time.LocalDateTime;

/** Representación de un {@link com.paqrap.simulador.EventoSimulacion} para el visualizador. */
public record EventoDTO(LocalDateTime instante, String tipo, String vehiculoId, int x, int y) {
}
