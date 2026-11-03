package com.paqrap.exposicion;

import java.time.LocalDateTime;
import java.util.List;

/** Instantánea completa del estado operativo, consumida por el visualizador en tiempo real. */
public record EstadoOperacionDTO(LocalDateTime marcaTiempoActual, List<RutaDTO> rutas, List<VehiculoDTO> vehiculos,
        List<AlmacenDTO> almacenes, List<BloqueoDTO> bloqueos, List<EventoDTO> eventos,
        MetricasOperacionDTO metricas, String idEjecucion) {
    public EstadoOperacionDTO(LocalDateTime marcaTiempoActual, List<RutaDTO> rutas, List<VehiculoDTO> vehiculos,
            List<AlmacenDTO> almacenes, List<BloqueoDTO> bloqueos, List<EventoDTO> eventos,
            MetricasOperacionDTO metricas) {
        this(marcaTiempoActual, rutas, vehiculos, almacenes, bloqueos, eventos, metricas, null);
    }

    public EstadoOperacionDTO conEjecucion(String id) {
        return new EstadoOperacionDTO(marcaTiempoActual, rutas, vehiculos, almacenes, bloqueos, eventos, metricas, id);
    }
}
