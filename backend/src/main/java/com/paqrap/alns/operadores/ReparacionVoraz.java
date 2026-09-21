package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.Solucion;
import com.paqrap.alns.VerificadorRestricciones;

import java.util.Iterator;
import java.util.List;

public class ReparacionVoraz implements OperadorReparacion {

    @Override
    public String getNombre() {
        return "Inserción Voraz (Greedy)";
    }

    @Override
    public void reparar(Solucion solucion, List<Pedido> pedidosNoAsignados, ContextoProblema contexto) {
        Iterator<Pedido> iterador = pedidosNoAsignados.iterator();

        while (iterador.hasNext()) {
            Pedido pedido = iterador.next();
            Ruta mejorRuta = null;
            int mejorIndiceInsercion = -1;
            double menorIncrementoCosto = Double.MAX_VALUE;

            for (Ruta ruta : solucion.getRutas()) {
                double costoActual = ruta.getCostoEstimado();

                for (int pos = 0; pos <= ruta.getSecuenciaParadas().size(); pos++) {
                    Ruta rutaPrueba = Solucion.copiarRuta(ruta);
                    rutaPrueba.getSecuenciaParadas().add(pos, new ParadaPlanificada(pedido, pedido.getCantidadSolicitada()));
                    OperadorUtil.recalcular(rutaPrueba, contexto);

                    if (esFactible(rutaPrueba, contexto)) {
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
                iterador.remove();
            }
        }
    }

    private static boolean esFactible(Ruta ruta, ContextoProblema contexto) {
        return VerificadorRestricciones.esRutaFactible(ruta, contexto.ciudad(), contexto.bloqueos(),
                contexto.configuracionOperacion());
    }
}
