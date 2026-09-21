package com.paqrap.exposicion;

import java.util.List;

/** Representación de una {@link com.paqrap.dominio.Ruta} para el visualizador. */
public record RutaDTO(String idRuta, String vehiculoId, String tipoVehiculo, String estado,
        List<String> secuenciaEntrega) {
}
