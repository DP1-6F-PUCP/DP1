package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.alns.Solucion;

import java.util.List;

/** Operador de "creación": reinserta pedidos no asignados en las rutas de la solución. */
public interface OperadorReparacion {

    String getNombre();

    /**
     * Reinserta la mayor cantidad posible de {@code pedidosNoAsignados} en las rutas de la
     * solución, removiéndolos de la lista a medida que se asignan.
     *
     * @param solucion solución de trabajo, mutada in-place
     * @param pedidosNoAsignados pedidos pendientes de asignación, mutada in-place
     * @param contexto contexto del problema vigente
     */
    void reparar(Solucion solucion, List<Pedido> pedidosNoAsignados, ContextoProblema contexto);
}
