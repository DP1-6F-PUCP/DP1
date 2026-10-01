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

                for (Ruta ruta : OperadorUtil.rutasCandidatas(solucion.getRutas(), pedido)) {
                    double costoActual = ruta.getCostoEstimado();

                    for (int pos = 0; pos <= ruta.getSecuenciaParadas().size(); pos++) {
                        Ruta rutaPrueba = Solucion.copiarRuta(ruta);
                        rutaPrueba.getSecuenciaParadas().add(pos,
                                new ParadaPlanificada(pedido, pedido.getCantidadSolicitada()));
                        OperadorUtil.recalcular(rutaPrueba, contexto);

                        if (esFactible(ruta, rutaPrueba, solucion, contexto)) {
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

                // Se suma un bono de urgencia al regret: antes, dos pedidos con el mismo regret
                // de costo se desempataban arbitrariamente (orden de iteración), ignorando cuál
                // está más cerca de incumplir. Ver OperadorUtil.bonoUrgencia.
                double regretEfectivo = regret + OperadorUtil.bonoUrgencia(pedido, contexto.marcaTiempoActual());
                if (regretEfectivo > valorMaxRegret) {
                    valorMaxRegret = regretEfectivo;
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

    private static boolean esFactible(Ruta rutaOriginal, Ruta rutaPrueba, Solucion solucion, ContextoProblema contexto) {
        return VerificadorRestricciones.esRutaFactible(rutaPrueba, contexto.ciudad(), contexto.bloqueos(),
                contexto.configuracionOperacion())
                && VerificadorRestricciones.respetaStockAlmacenes(rutaOriginal, rutaPrueba, solucion.getRutas(),
                        contexto.almacenes());
    }
}
