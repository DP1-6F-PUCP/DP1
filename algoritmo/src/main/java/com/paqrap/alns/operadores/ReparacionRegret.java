package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.Solucion;
import com.paqrap.alns.VerificadorRestricciones;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class ReparacionRegret implements OperadorReparacion {

    private final int kRegret;

    public ReparacionRegret(int kRegret) {
        this.kRegret = kRegret;
    }

    @Override
    public String getNombre() {
        return "Inserción Regret-" + kRegret;
    }

    private record OpcionInsercion(Ruta ruta, int posicion, double deltaCosto) {
    }

    @Override
    public void reparar(Solucion solucion, List<Pedido> pedidosNoAsignados, ContextoProblema contexto) {
        while (!pedidosNoAsignados.isEmpty()) {
            Pedido pedidoMaxRegret = null;
            Ruta rutaMaxRegret = null;
            int posMaxRegret = -1;
            double valorMaxRegret = -Double.MAX_VALUE;

            for (Pedido pedido : pedidosNoAsignados) {
                List<OpcionInsercion> opciones = new ArrayList<>();

                for (Ruta ruta : solucion.getRutas()) {
                    double costoActual = ruta.getCostoEstimado();

                    for (int pos = 0; pos <= ruta.getSecuenciaParadas().size(); pos++) {
                        Ruta rutaPrueba = Solucion.copiarRuta(ruta);
                        rutaPrueba.getSecuenciaParadas().add(pos,
                                new ParadaPlanificada(pedido, pedido.getCantidadSolicitada()));
                        OperadorUtil.recalcular(rutaPrueba, contexto);

                        if (esFactible(rutaPrueba, contexto)) {
                            double delta = rutaPrueba.getCostoEstimado() - costoActual;
                            opciones.add(new OpcionInsercion(ruta, pos, delta));
                        }
                    }
                }

                if (opciones.isEmpty()) {
                    continue;
                }

                opciones.sort(Comparator.comparingDouble(OpcionInsercion::deltaCosto));

                double regret;
                if (opciones.size() == 1) {
                    regret = opciones.get(0).deltaCosto();
                } else {
                    int k = Math.min(kRegret - 1, opciones.size() - 1);
                    regret = opciones.get(k).deltaCosto() - opciones.get(0).deltaCosto();
                }

                if (regret > valorMaxRegret) {
                    valorMaxRegret = regret;
                    pedidoMaxRegret = pedido;
                    rutaMaxRegret = opciones.get(0).ruta();
                    posMaxRegret = opciones.get(0).posicion();
                }
            }

            if (pedidoMaxRegret != null) {
                rutaMaxRegret.getSecuenciaParadas().add(posMaxRegret,
                        new ParadaPlanificada(pedidoMaxRegret, pedidoMaxRegret.getCantidadSolicitada()));
                OperadorUtil.recalcular(rutaMaxRegret, contexto);
                pedidosNoAsignados.remove(pedidoMaxRegret);
            } else {
                break;
            }
        }
    }

    private static boolean esFactible(Ruta ruta, ContextoProblema contexto) {
        return VerificadorRestricciones.esRutaFactible(ruta, contexto.ciudad(), contexto.bloqueos(),
                contexto.configuracionOperacion());
    }
}
