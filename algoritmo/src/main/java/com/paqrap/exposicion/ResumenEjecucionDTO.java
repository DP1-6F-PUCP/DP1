package com.paqrap.exposicion;

import java.time.Instant;
import java.time.LocalDateTime;

/** Fila del listado de ejecuciones pasadas (GET /api/escenarios). Los conteos son null sin reporte. */
public record ResumenEjecucionDTO(String idEjecucion, String tipoEscenario, String estado, String motivoFinalizacion,
        Instant inicioReal, Instant finReal, LocalDateTime inicioSimulado, LocalDateTime finSimulado,
        Integer totalPedidos, Integer entregados, Integer incumplidos, boolean tieneReporte) {
}
