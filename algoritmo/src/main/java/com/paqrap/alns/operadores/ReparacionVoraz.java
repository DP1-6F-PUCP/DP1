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

public class ReparacionVoraz implements OperadorReparacion {

    @Override
    public String getNombre() {
        return "Inserción Voraz (Greedy)";
    }

    @Override
    public void reparar(Solucion solucion, List<Pedido> pedidosNoAsignados, ContextoProblema contexto) {
        // Se procesa por orden de plazo (más urgente primero) -- antes se procesaba en el orden
        // en que llegaban (arbitrario), así que dos pedidos compitiendo por el mismo mejor hueco
        // se los repartía sin importar cuál estaba más cerca de incumplir. Se itera sobre una
        // copia ordenada y se remueve de la lista original (pedidosNoAsignados), que es la que
        // usa el resto de ALNS para saber qué quedó sin asignar.
        List<Pedido> ordenPorUrgencia = new ArrayList<>(pedidosNoAsignados);
        ordenPorUrgencia.sort(Comparator.comparing(Pedido::getFechaLimite));

        for (Pedido pedido : ordenPorUrgencia) {
            Ruta mejorRuta = null;
            int mejorIndiceInsercion = -1;
            double menorIncrementoCosto = Double.MAX_VALUE;

            for (Ruta ruta : OperadorUtil.rutasCandidatas(solucion.getRutas(), pedido)) {
                double costoActual = ruta.getCostoEstimado();

                for (int pos = 0; pos <= ruta.getSecuenciaParadas().size(); pos++) {
                    Ruta rutaPrueba = Solucion.copiarRuta(ruta);
                    rutaPrueba.getSecuenciaParadas().add(pos, new ParadaPlanificada(pedido, pedido.getCantidadSolicitada()));
                    OperadorUtil.recalcular(rutaPrueba, contexto);

                    if (esFactible(ruta, rutaPrueba, solucion, contexto)) {
                        double delta = rutaPrueba.getCostoEstimado() - costoActual;
                        if (delta < menorIncrementoCosto) {
                            menorIncrementoCosto = delta;
                            mejorRuta = ruta;
                            mejorIndiceInsercion = pos;
                        }
                    }
                }
            }

            if (mejorRuta != null) {
                mejorRuta.getSecuenciaParadas().add(mejorIndiceInsercion,
                        new ParadaPlanificada(pedido, pedido.getCantidadSolicitada()));
                OperadorUtil.recalcular(mejorRuta, contexto);
                pedidosNoAsignados.remove(pedido);
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
