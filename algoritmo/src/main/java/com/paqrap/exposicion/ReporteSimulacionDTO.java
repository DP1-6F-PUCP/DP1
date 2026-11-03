package com.paqrap.exposicion;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/** Instantáneas inmutables: no dependen de la flota compartida por el siguiente escenario. */
public record ReporteSimulacionDTO(
        String idEjecucion, String tipoEscenario, String motivoFinalizacion,
        Instant inicioReal, Instant finReal, long duracionRealMs,
        LocalDateTime inicioSimulado, LocalDateTime finSimulado, long duracionSimuladaMs,
        EstadoOperacionDTO estadoFinal, List<PedidoDTO> pedidosFinales,
        EstadoOperacionDTO ultimaPlanificacionEstable, List<PedidoDTO> pedidosPlanificacionEstable) {
}
