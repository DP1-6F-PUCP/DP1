package com.paqrap.dominio;

import java.util.List;

/**
 * Contrato único que debe implementar todo algoritmo de planificación de rutas.
 *
 * <p>No existe un método {@code replanificar()} separado: replanificar es volver a invocar
 * {@link #planificarRutas(ContextoProblema)} con un {@link ContextoProblema} actualizado que
 * refleje el estado posterior a una incidencia (avería, bloqueo, nuevo pedido).
 */
public interface Planificador {

    /**
     * Genera (o regenera) el conjunto de rutas para el estado del problema dado.
     *
     * @param contexto instantánea completa del estado del problema
     * @return rutas planificadas para las unidades de transporte disponibles
     */
    List<Ruta> planificarRutas(ContextoProblema contexto);
}
