package com.paqrap.simulador;

/** Clasificación de un {@link EventoSimulacion} dentro del registro de movimientos de la simulación. */
public enum TipoEvento {
    INICIO_SIMULACION,
    PLANIFICACION_RUTAS,
    DESPACHO_VEHICULO,
    MOVIMIENTO_TRAMO,
    LLEGADA_A_DESTINO,
    INICIO_SERVICIO,
    FIN_SERVICIO_ENTREGA,
    INICIO_REFRIGERIO,
    FIN_REFRIGERIO,
    RETORNO_ALMACEN,
    LLEGADA_ALMACEN,
    INCIDENCIA_BLOQUEO,
    INCIDENCIA_AVERIA_VEHICULO,
    INCIDENCIA_NUEVO_PEDIDO,
    REPLANIFICACION_RUTAS,
    INICIO_TRASVASE,
    FIN_TRASVASE,
    SNAPSHOT_ESTADO,
    PEDIDO_EN_RIESGO_SLA,
    /** Solicitud de cambio de configuración aplicada en caliente (velocidad, capacidad, flota, etc.). */
    CAMBIO_CONFIGURACION,
    FIN_SIMULACION
}
