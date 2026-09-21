package com.paqrap.dominio;

import java.time.LocalDateTime;

/**
 * Registro de un movimiento de stock (entrada por recarga o salida por despacho) sobre un {@link Almacen}.
 *
 * @param tipo naturaleza del movimiento
 * @param cantidad unidades de producto P movidas
 * @param fecha momento en que ocurrió el movimiento
 */
public record MovimientoInventario(TipoMovimiento tipo, int cantidad, LocalDateTime fecha) {
}
