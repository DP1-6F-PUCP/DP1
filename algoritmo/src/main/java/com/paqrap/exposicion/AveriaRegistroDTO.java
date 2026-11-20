package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Una avería ocurrida en la ejecución activa.
 *
 * @param trasladoAlmacen instante en que la unidad es llevada al almacén central (tipos 2 y 3), o
 *         {@code null} (tipo 1: se repara en el sitio)
 */
public record AveriaRegistroDTO(String idUnidad, String tipoVehiculo, String tipoAveria, LocalDateTime inicio,
        LocalDateTime finEstimado, LocalDateTime trasladoAlmacen, int x, int y) {
}
