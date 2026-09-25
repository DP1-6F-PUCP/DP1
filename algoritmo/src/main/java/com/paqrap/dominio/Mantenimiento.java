package com.paqrap.dominio;

import java.time.LocalDateTime;

/**
 * Entrada de mantenimiento preventivo programado para una unidad de transporte.
 *
 * <p>La unidad afectada no está disponible para programación de rutas durante todo el
 * intervalo [{@code fechaInicio}, {@code fechaFinCalculada}].
 *
 * @param vehiculoAfectado unidad de transporte programada para mantenimiento
 * @param fechaInicio momento de inicio del mantenimiento
 * @param fechaFinCalculada momento de fin, calculado según la duración propia del {@link TipoVehiculo}
 */
public record Mantenimiento(UnidadTransporte vehiculoAfectado, LocalDateTime fechaInicio, LocalDateTime fechaFinCalculada) {
}
