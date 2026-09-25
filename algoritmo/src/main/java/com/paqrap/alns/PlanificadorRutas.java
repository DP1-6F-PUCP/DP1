package com.paqrap.alns;

import com.paqrap.dominio.Planificador;

/**
 * Especialización de {@link Planificador} propia de ALNS: añade {@link #getNombre()} para que
 * {@code ExperimentoComparativo} pueda etiquetar resultados por algoritmo.
 */
public interface PlanificadorRutas extends Planificador {

    String getNombre();
}
