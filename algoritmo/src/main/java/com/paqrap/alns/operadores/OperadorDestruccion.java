package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.alns.Solucion;

import java.util.List;

/** Operador de "ruina": remueve pedidos de la solución de trabajo según una estrategia dada. */
public interface OperadorDestruccion {

    String getNombre();

    /**
     * Remueve hasta {@code q} pedidos de las rutas de la solución.
     *
     * @param solucion solución de trabajo, mutada in-place
     * @param q cantidad objetivo de pedidos a remover
     * @param contexto contexto del problema vigente
     * @return pedidos efectivamente removidos
     */
    List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto);
}
