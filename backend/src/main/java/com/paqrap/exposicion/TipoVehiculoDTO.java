package com.paqrap.exposicion;

/** Representación de {@link com.paqrap.dominio.TipoVehiculo} para el visualizador. */
public record TipoVehiculoDTO(String id, String nombre, int capacidad, float velocidadKmH, float costoPorKm) {
}
