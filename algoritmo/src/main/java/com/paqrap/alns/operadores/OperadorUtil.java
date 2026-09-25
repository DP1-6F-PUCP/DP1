package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.EvaluadorCostos;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.List;

/** Utilidades compartidas por los operadores de destrucción y reparación de ALNS. */
final class OperadorUtil {

    private OperadorUtil() {
    }

    static List<Pedido> pedidosAsignados(Solucion solucion) {
        List<Pedido> pedidos = new ArrayList<>();
        for (Ruta ruta : solucion.getRutas()) {
            for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
                pedidos.add(parada.getPedido());
            }
        }
        return pedidos;
    }

    /**
     * Remueve la parada correspondiente al pedido dado de cualquier ruta de la solución que la
     * contenga, y recalcula esa ruta.
     *
     * @return {@code true} si se encontró y removió la parada
     */
    static boolean removerPedido(Solucion solucion, Pedido pedido, ContextoProblema contexto) {
        for (Ruta ruta : solucion.getRutas()) {
            boolean removido = ruta.getSecuenciaParadas().removeIf(parada -> parada.getPedido().equals(pedido));
            if (removido) {
                recalcular(ruta, contexto);
                return true;
            }
        }
        return false;
    }

    static void recalcular(Ruta ruta, ContextoProblema contexto) {
        EvaluadorCostos.recalcularRuta(ruta, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
    }
}
