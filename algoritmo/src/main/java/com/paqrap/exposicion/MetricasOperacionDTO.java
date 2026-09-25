package com.paqrap.exposicion;

/** Representación de {@link com.paqrap.simulador.ReporteDesempeno} para el visualizador. */
public record MetricasOperacionDTO(float costoTotalAcumulado, float porcentajeEntregasATiempo,
        int contadorParadasReasignadas, int contadorAverias, int contadorInterferenciasBloqueo) {
}
