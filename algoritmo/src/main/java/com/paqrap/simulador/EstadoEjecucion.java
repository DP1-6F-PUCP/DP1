package com.paqrap.simulador;

/** Estado de ciclo de vida de una {@link EjecucionEscenario}. */
public enum EstadoEjecucion {
    INICIADA,
    EN_CURSO,
    PAUSADA,
    FINALIZADA,
    DETENIDA_POR_INCUMPLIMIENTO,
    /** Cortada por un apagado o reinicio del backend (ordenado, o detectada como huérfana al arrancar). */
    INTERRUMPIDA
}
