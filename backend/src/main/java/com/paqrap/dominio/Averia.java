package com.paqrap.dominio;

import java.time.LocalDateTime;

/**
 * Incidente que inmoviliza a una {@link UnidadTransporte} por un período determinado.
 *
 * <p>El tramo donde ocurre una avería sigue siendo transitable para otras unidades — solo
 * {@link Bloqueo#interfiereCon} afecta la transitabilidad de la red vial. Una unidad averiada
 * de tipo TIPO_2 o TIPO_3 se traslada instantáneamente al almacén central junto con los
 * paquetes que no hayan sido trasvasados a otra unidad.
 *
 * @param tipo severidad de la avería
 * @param fechaInicio momento en que ocurrió la avería
 * @param fechaFinEstimada momento estimado de reincorporación de la unidad
 * @param tiempoPermanenciaEnSitioHoras horas que la unidad permanece inmovilizada en el sitio antes de ser trasladada
 * @param fechaTrasladoAlmacen momento en que la unidad (y sus paquetes no trasvasados) es trasladada al almacén central
 */
public record Averia(
        TipoAveria tipo,
        LocalDateTime fechaInicio,
        LocalDateTime fechaFinEstimada,
        int tiempoPermanenciaEnSitioHoras,
        LocalDateTime fechaTrasladoAlmacen) {
}
