package com.paqrap.exposicion;

import java.time.LocalDateTime;
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
 * @param actividad qué está haciendo la unidad en este instante dentro de su {@code estado}
 *         general (ver {@link com.paqrap.dominio.ActividadVehiculo}) -- distingue, p. ej., un
 *         vehículo {@code EN_RUTA} que viaja de uno {@code EN_RUTA} detenido entregando o en
 *         refrigerio, casos que antes eran indistinguibles para el visualizador.
 * @param actividadDesde instante en que arrancó la fase actual de {@code actividad}
 *         ({@code ENTREGANDO}/{@code EN_REFRIGERIO}), o {@code null} si no aplica
 *         ({@code VIAJANDO}/{@code INACTIVO} no tienen una duración fija que mostrar). Junto con
 *         {@code ConfiguracionOperacionDTO.tiempoServicioClienteHoras}/{@code duracionRefrigerioHoras}
 *         (ya expuestos, no se duplican aquí) el visualizador puede calcular cuánto lleva
 *         detenido un vehículo y cuánto le falta, en vez de solo saber que está detenido.
 */
public record VehiculoDTO(String idUnidad, String tipo, String estado, int posXActual, int posYActual,
        int cargaActual, List<String> geometriaRetorno, String actividad, LocalDateTime actividadDesde) {
}
