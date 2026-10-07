package com.paqrap.exposicion;

import java.util.List;

/**
 * Representación de una {@link com.paqrap.dominio.UnidadTransporte} para el visualizador.
 *
 * @param geometriaRetorno camino real nodo a nodo hacia el almacén más cercano, solo presente
 *         cuando la unidad está {@code DISPONIBLE} sin ruta en ejecución y no está ya en un
 *         almacén -- MotorSimulacion.simularRetornoAlmacen mueve la unidad de vuelta al terminar
 *         sus entregas, pero el objeto {@code Ruta} se marca FINALIZADA de inmediato (libera la
 *         unidad para una reasignación), así que ese tramo de regreso no vive en ningún
 *         {@code RutaDTO.geometria}. Mismo formato "x,y" que el resto de geometrías; vacío cuando
 *         no aplica.
 */
public record VehiculoDTO(String idUnidad, String tipo, String estado, int posXActual, int posYActual,
        int cargaActual, List<String> geometriaRetorno) {
}
