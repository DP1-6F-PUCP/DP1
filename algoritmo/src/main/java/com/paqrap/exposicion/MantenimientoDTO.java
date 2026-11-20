package com.paqrap.exposicion;

import java.time.LocalDateTime;

/** Un mantenimiento programado de una unidad (calendario oficial más los cargados a mano). */
public record MantenimientoDTO(String idUnidad, String tipoVehiculo, LocalDateTime inicio, LocalDateTime fin) {
}
