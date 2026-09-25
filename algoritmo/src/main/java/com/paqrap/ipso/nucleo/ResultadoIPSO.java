package com.paqrap.ipso.nucleo;

import com.paqrap.dominio.Pedido;

import java.util.List;

/** Salida de IPSO: G_best traducido a secuencia de {@link Pedido}, costo y duración. */
public record ResultadoIPSO(List<Pedido> secuenciaOptima, double costoTotal, double duracionTotalHoras,
        boolean cumplePlazos) {
}
