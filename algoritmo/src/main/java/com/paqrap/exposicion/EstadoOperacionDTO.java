package com.paqrap.exposicion;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Instantánea completa del estado operativo, consumida por el visualizador en tiempo real.
 *
 * @param secuencia número correlativo de la publicación dentro de la ejecución (1, 2, 3…): el
 *         visualizador detecta un hueco y pide los lotes que le faltan, así nunca pierde una trayectoria
 * @param pedidosCambiados pedidos nuevos o que cambiaron desde la publicación anterior; el
 *         visualizador los mezcla con los que ya conoce en vez de volver a pedir la lista completa
 */
public record EstadoOperacionDTO(LocalDateTime marcaTiempoActual, List<RutaDTO> rutas, List<VehiculoDTO> vehiculos,
        List<AlmacenDTO> almacenes, List<BloqueoDTO> bloqueos, List<EventoDTO> eventos,
        MetricasOperacionDTO metricas, String idEjecucion, long secuencia, List<PedidoDTO> pedidosCambiados) {
    public EstadoOperacionDTO(LocalDateTime marcaTiempoActual, List<RutaDTO> rutas, List<VehiculoDTO> vehiculos,
            List<AlmacenDTO> almacenes, List<BloqueoDTO> bloqueos, List<EventoDTO> eventos,
            MetricasOperacionDTO metricas) {
        this(marcaTiempoActual, rutas, vehiculos, almacenes, bloqueos, eventos, metricas, null, 0, List.of());
    }

    public EstadoOperacionDTO conEjecucion(String id) {
        return new EstadoOperacionDTO(marcaTiempoActual, rutas, vehiculos, almacenes, bloqueos, eventos, metricas, id,
                secuencia, pedidosCambiados);
    }

    public EstadoOperacionDTO conPublicacion(long secuencia, List<PedidoDTO> pedidosCambiados) {
        return new EstadoOperacionDTO(marcaTiempoActual, rutas, vehiculos, almacenes, bloqueos, eventos, metricas,
                idEjecucion, secuencia, pedidosCambiados);
    }
}
