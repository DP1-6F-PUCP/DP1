package com.paqrap.exposicion;

import java.time.LocalDateTime;
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
 * @param origenX nodo de salida de la ruta: donde se despachó, o la posición actual de la unidad
 *         si sigue PLANIFICADA
 * @param origenY ver {@code origenX}
 * @param horaSalida instante real de despacho, o el planificado si sigue PLANIFICADA
 */
public record RutaDTO(String idRuta, String vehiculoId, String tipoVehiculo, String estado,
        List<String> secuenciaEntrega, double costoEstimado, double duracionEstimadaHoras,
        List<String> geometria, int origenX, int origenY, LocalDateTime horaSalida) {
}
