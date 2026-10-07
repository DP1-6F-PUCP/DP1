package com.paqrap.exposicion;

import java.util.List;

/**
 * Representación de una {@link com.paqrap.dominio.Ruta} para el visualizador.
 *
 * @param geometria camino real nodo a nodo desde la posición actual de la unidad hasta la última
 *         parada, pasando por cada parada intermedia en orden -- el mismo camino que
 *         {@code CalculadorDistancia} usó para evaluar la ruta (respeta bloqueos vigentes), no una
 *         aproximación recalculada aparte por el cliente. Cada nodo como {@code "x,y"}, mismo
 *         formato que {@code BloqueoDTO.secuenciaNodos}. Puede terminar antes de la última parada
 *         si algún tramo queda sin camino transitable (bloqueo total); vacía solo si ni el primer
 *         tramo tiene camino.
 */
public record RutaDTO(String idRuta, String vehiculoId, String tipoVehiculo, String estado,
        List<String> secuenciaEntrega, double costoEstimado, double duracionEstimadaHoras,
        List<String> geometria) {
}
