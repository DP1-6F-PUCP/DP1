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
import java.util.Random;

/**
 * Operador de Reparación: Inserción Regret con Factor de Ruido (Noise Regret). Referencia:
 * Ropke &amp; Pisinger (2006b), Friedrich &amp; Elbert (2022, Sección 4.3.3). Incorpora un
 * término de perturbación estocástica aleatoria al evaluar los costos de inserción:
 * ΔC' = max(0, ΔC * (1 + ξ)), con ξ ∈ [-factorRuido, +factorRuido]. Crucial para romper empates
 * y simetrías en la cuadrícula de Manhattan de PaqRap.
 */
public class ReparacionRegretRuido implements OperadorReparacion {

    private final int kRegret;
    private final double factorRuidoMax;
    private final Random random = new Random();

    public ReparacionRegretRuido(int kRegret, double factorRuidoMax) {
        this.kRegret = kRegret;
        this.factorRuidoMax = factorRuidoMax;
    }

    @Override
    public String getNombre() {
        return String.format("Inserción Regret-%d con Ruido (%.0f%%)", kRegret, factorRuidoMax * 100);
    }

    private record OpcionInsercion(Ruta ruta, int posicion, double deltaCostoConRuido) {
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
                            double xi = (random.nextDouble() * 2.0 - 1.0) * factorRuidoMax;
                            double deltaConRuido = Math.max(0.0, delta * (1.0 + xi));
                            opciones.add(new OpcionInsercion(ruta, pos, deltaConRuido));
                        }
                    }
                }

                if (opciones.isEmpty()) {
                    continue;
                }

                opciones.sort(Comparator.comparingDouble(OpcionInsercion::deltaCostoConRuido));

                double regret;
                if (opciones.size() == 1) {
                    regret = opciones.get(0).deltaCostoConRuido();
                } else {
                    int k = Math.min(kRegret - 1, opciones.size() - 1);
                    regret = opciones.get(k).deltaCostoConRuido() - opciones.get(0).deltaCostoConRuido();
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
