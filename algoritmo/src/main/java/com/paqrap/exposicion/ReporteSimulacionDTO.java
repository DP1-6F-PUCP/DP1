package com.paqrap.exposicion;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Instantáneas inmutables: no dependen de la flota compartida por el siguiente escenario.
 *
 * @param averias averías ocurridas en la ejecución (al iniciar o en caliente)
 * @param solicitudes ajustes iniciales y cambios en caliente, con su resultado
 */
public record ReporteSimulacionDTO(
        String idEjecucion, String tipoEscenario, String motivoFinalizacion,
        Instant inicioReal, Instant finReal, long duracionRealMs,
        LocalDateTime inicioSimulado, LocalDateTime finSimulado, long duracionSimuladaMs,
        EstadoOperacionDTO estadoFinal, List<PedidoDTO> pedidosFinales,
        EstadoOperacionDTO ultimaPlanificacionEstable, List<PedidoDTO> pedidosPlanificacionEstable,
        List<AveriaRegistroDTO> averias, List<SolicitudRegistroDTO> solicitudes) {

    /** Forma anterior (sin averías ni solicitudes); los reportes viejos guardados en BD tampoco las traen. */
    public ReporteSimulacionDTO(String idEjecucion, String tipoEscenario, String motivoFinalizacion,
            Instant inicioReal, Instant finReal, long duracionRealMs,
            LocalDateTime inicioSimulado, LocalDateTime finSimulado, long duracionSimuladaMs,
            EstadoOperacionDTO estadoFinal, List<PedidoDTO> pedidosFinales,
            EstadoOperacionDTO ultimaPlanificacionEstable, List<PedidoDTO> pedidosPlanificacionEstable) {
        this(idEjecucion, tipoEscenario, motivoFinalizacion, inicioReal, finReal, duracionRealMs, inicioSimulado,
                finSimulado, duracionSimuladaMs, estadoFinal, pedidosFinales, ultimaPlanificacionEstable,
                pedidosPlanificacionEstable, List.of(), List.of());
    }
}
