package com.paqrap.dominio;

/** Estado de ejecución de una {@link Ruta} asignada a una {@link UnidadTransporte}. */
public enum EstadoRuta {
    PLANIFICADA,
    EN_EJECUCION,
    FINALIZADA,
    REEMPLAZADA
}
