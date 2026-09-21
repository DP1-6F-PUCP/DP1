package com.paqrap.exposicion;

/** Representación de un {@link com.paqrap.dominio.Almacen} para el visualizador. */
public record AlmacenDTO(String nombre, boolean esCentral, int posX, int posY, int stockActual, int capacidadMaxima,
        float nivelOcupacion) {
}
