package com.paqrap.alns.operadores;

import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

/**
 * Operador de Ruina: Eliminación por Conglomerados / Zonas Geográficas (Cluster / Radial Removal).
 * Referencia: Ropke &amp; Pisinger (2006b), Friedrich &amp; Elbert (2022). Selecciona un cliente
 * semilla y elimina sus vecinos más próximos en la cuadrícula, permitiendo rediseñar y
 * consolidar zonas geográficas completas.
 */
public class DestruccionCluster implements OperadorDestruccion {

    @Override
    public String getNombre() {
        return "Destrucción por Conglomerado (Cluster Removal)";
    }

    @Override
    public List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto) {
        List<Pedido> removidos = new ArrayList<>();
        List<Pedido> todosAsignados = OperadorUtil.pedidosAsignados(solucion);
        if (todosAsignados.isEmpty()) {
            return removidos;
        }

        Random random = new Random();
        Pedido semilla = todosAsignados.remove(random.nextInt(todosAsignados.size()));
        removidos.add(semilla);

        todosAsignados.sort(Comparator.comparingDouble(p -> CalculadorDistancia.distanciaKm(
                contexto.ciudad(), contexto.bloqueos(), contexto.marcaTiempoActual(),
                semilla.getDestino(), p.getDestino())));

        int aRemover = Math.min(q - 1, todosAsignados.size());
        for (int i = 0; i < aRemover; i++) {
            removidos.add(todosAsignados.get(i));
        }

        for (Pedido pedido : removidos) {
            OperadorUtil.removerPedido(solucion, pedido, contexto);
        }

        return removidos;
    }
}
