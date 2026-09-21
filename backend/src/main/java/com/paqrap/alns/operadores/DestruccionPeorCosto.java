package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DestruccionPeorCosto implements OperadorDestruccion {

    @Override
    public String getNombre() {
        return "Destrucción por Peor Costo";
    }

    @Override
    public List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto) {
        List<Pedido> removidos = new ArrayList<>();
        Map<Pedido, Double> ahorros = new HashMap<>();

        for (Ruta ruta : solucion.getRutas()) {
            double costoOriginal = ruta.getCostoEstimado();

            for (var parada : List.copyOf(ruta.getSecuenciaParadas())) {
                Ruta rutaTemporal = Solucion.copiarRuta(ruta);
                rutaTemporal.getSecuenciaParadas().removeIf(p -> p.getPedido().equals(parada.getPedido()));
                OperadorUtil.recalcular(rutaTemporal, contexto);

                ahorros.put(parada.getPedido(), costoOriginal - rutaTemporal.getCostoEstimado());
            }
        }

        if (ahorros.isEmpty()) {
            return removidos;
        }

        List<Map.Entry<Pedido, Double>> entradasOrdenadas = new ArrayList<>(ahorros.entrySet());
        entradasOrdenadas.sort((e1, e2) -> Double.compare(e2.getValue(), e1.getValue()));

        int aRemover = Math.min(q, entradasOrdenadas.size());
        for (int i = 0; i < aRemover; i++) {
            Pedido pedido = entradasOrdenadas.get(i).getKey();
            OperadorUtil.removerPedido(solucion, pedido, contexto);
            removidos.add(pedido);
        }

        return removidos;
    }
}
