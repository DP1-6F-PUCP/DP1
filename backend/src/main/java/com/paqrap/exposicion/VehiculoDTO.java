package com.paqrap.exposicion;

/** Representación de una {@link com.paqrap.dominio.UnidadTransporte} para el visualizador. */
public record VehiculoDTO(String idUnidad, String tipo, String estado, int posXActual, int posYActual,
        int cargaActual) {
}
