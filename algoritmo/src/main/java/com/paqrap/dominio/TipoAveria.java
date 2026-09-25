package com.paqrap.dominio;

/**
 * Clasificación de severidad de una {@link Averia}.
 *
 * <p>TIPO_1 (menor): 2 horas fuera de servicio. TIPO_2 (intermedia): fuera de servicio hasta
 * el final del turno siguiente (máx. 4 horas), la unidad permanece en el lugar. TIPO_3 (mayor):
 * fuera de servicio al menos 2 días, reincorporación al inicio del turno 15:00-23:00.
 */
public enum TipoAveria {
    TIPO_1,
    TIPO_2,
    TIPO_3
}
