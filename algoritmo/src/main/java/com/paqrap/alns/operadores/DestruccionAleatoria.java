package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class DestruccionAleatoria implements OperadorDestruccion {

    @Override
    public String getNombre() {
        return "Destrucción Aleatoria";
    }

    @Override
    public List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto) {
        List<Pedido> removidos = new ArrayList<>();
        Random random = new Random();

        List<Pedido> todosAsignados = OperadorUtil.pedidosAsignados(solucion);
        if (todosAsignados.isEmpty()) {
            return removidos;
        }

        int aRemover = Math.min(q, todosAsignados.size());
        for (int i = 0; i < aRemover; i++) {
            Pedido pedido = todosAsignados.remove(random.nextInt(todosAsignados.size()));
            OperadorUtil.removerPedido(solucion, pedido, contexto);
            removidos.add(pedido);
        }

        return removidos;
    }
}
