package com.paqrap.alns.operadores;

import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class DestruccionShaw implements OperadorDestruccion {

    private final double pesoDistancia;
    private final double pesoTiempo;

    public DestruccionShaw(double pesoDistancia, double pesoTiempo) {
        this.pesoDistancia = pesoDistancia;
        this.pesoTiempo = pesoTiempo;
    }

    @Override
    public String getNombre() {
        return "Destrucción Relacionada (Shaw)";
    }

    @Override
    public List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto) {
        List<Pedido> removidos = new ArrayList<>();
        List<Pedido> todosAsignados = OperadorUtil.pedidosAsignados(solucion);
        if (todosAsignados.isEmpty()) {
            return removidos;
        }

        Random random = new Random();
        Pedido semilla = todosAsignados.get(random.nextInt(todosAsignados.size()));
        removidos.add(semilla);
        todosAsignados.remove(semilla);

        while (removidos.size() < q && !todosAsignados.isEmpty()) {
            Pedido referencia = removidos.get(random.nextInt(removidos.size()));

            Pedido masRelacionado = null;
            double menorRelacion = Double.MAX_VALUE;

            for (Pedido p : todosAsignados) {
                double dist = CalculadorDistancia.distanciaKm(contexto.ciudad(), contexto.bloqueos(),
                        contexto.marcaTiempoActual(), referencia.getDestino(), p.getDestino());
                double difPlazo = Math.abs(referencia.getHorasLimite() - p.getHorasLimite());
                double relacion = dist * pesoDistancia + difPlazo * pesoTiempo;

                if (relacion < menorRelacion) {
                    menorRelacion = relacion;
                    masRelacionado = p;
                }
            }

            if (masRelacionado != null) {
                removidos.add(masRelacionado);
                todosAsignados.remove(masRelacionado);
            } else {
                break;
            }
        }

        for (Pedido pedido : removidos) {
            OperadorUtil.removerPedido(solucion, pedido, contexto);
        }

        return removidos;
    }
}
