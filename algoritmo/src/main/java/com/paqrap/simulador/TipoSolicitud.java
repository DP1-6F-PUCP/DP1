package com.paqrap.simulador;

/** Tipo de cambio "en caliente" solicitado a {@link OrquestadorOperacion} durante una ejecución. */
public enum TipoSolicitud {
    AVERIA,
    CAMBIO_VELOCIDAD,
    CAMBIO_CAPACIDAD,
    CAMBIO_CANTIDAD_VEHICULOS,
    CAMBIO_POSICION_ALMACEN,
    CAMBIO_CAPACIDAD_ALMACEN,
    CAMBIO_FRECUENCIA_RECARGA,
    CAMBIO_CONFIGURACION_CIUDAD,
    CAMBIO_CONFIGURACION_OPERACION
}
