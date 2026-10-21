package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Un punto del recorrido real de un vehículo en el último lote (ver
 * {@code UnidadTransporte.PuntoTrayectoria}): desde {@code instante} hasta el punto siguiente, el
 * vehículo hace {@code actividad} -- si el punto siguiente está en otro nodo, viaja hacia él.
 */
public record PuntoTrayectoriaDTO(int x, int y, LocalDateTime instante, String actividad) {
}
