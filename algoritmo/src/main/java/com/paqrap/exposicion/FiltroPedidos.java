package com.paqrap.exposicion;

/**
 * Parámetro práctico para {@link ServicioPlanificacion#consultarPedidos}: el diagrama declara un
 * único parámetro {@code filtro} sin tipar. Se modela como un filtro opcional por estado
 * ({@code null} = sin filtrar).
 *
 * @param estado nombre de {@link com.paqrap.dominio.EstadoPedido} a filtrar, o {@code null} para no filtrar
 */
public record FiltroPedidos(String estado) {
}
