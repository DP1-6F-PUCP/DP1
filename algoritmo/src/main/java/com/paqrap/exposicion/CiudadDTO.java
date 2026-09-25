package com.paqrap.exposicion;

/** Representación de {@link com.paqrap.dominio.Ciudad} para el visualizador. */
public record CiudadDTO(int ancho, int alto, int distanciaEntreNodos, boolean callesDobleSentido, int origenX,
        int origenY) {
}
