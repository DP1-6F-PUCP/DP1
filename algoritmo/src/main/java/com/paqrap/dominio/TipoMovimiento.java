package com.paqrap.dominio;

/** Tipo de {@link MovimientoInventario} sobre un almacén. */
public enum TipoMovimiento {
    ENTRADA_RECARGA,
    /** Paquetes que vuelven: reserva que no se llegó a cargar, o sobrante que trae una unidad. */
    ENTRADA_DEVOLUCION,
    SALIDA_DESPACHO
}
