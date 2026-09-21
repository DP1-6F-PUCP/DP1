package com.paqrap.alns.nucleo;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.alns.EvaluadorCostos;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Recombinación periódica del pool histórico de rutas evaluadas (Set Partitioning Problem),
 * seleccionando de forma voraz las rutas más eficientes (costo por pedido) sin solapamiento de
 * pedidos ni de unidades de transporte.
 */
public class SolucionadorParticionConjuntos {

    public Solucion resolver(List<Ruta> poolRutas, ContextoProblema contexto) {
        if (poolRutas.isEmpty()) {
            return new Solucion();
        }

        List<Pedido> todosPedidos = contexto.pedidos();
        Set<Pedido> pedidosCubiertos = new HashSet<>();
        List<Ruta> rutasSeleccionadas = new ArrayList<>();
        Set<String> unidadesUsadas = new HashSet<>();

        List<Ruta> poolOrdenado = new ArrayList<>(poolRutas);
        poolOrdenado.sort(Comparator.comparingDouble(r -> {
            if (r.getSecuenciaParadas().isEmpty()) {
                return Double.MAX_VALUE;
            }
            return r.getCostoEstimado() / r.getSecuenciaParadas().size();
        }));

        for (Ruta candidata : poolOrdenado) {
            String idUnidad = candidata.getUnidadTransporte().getIdUnidad();
            if (unidadesUsadas.contains(idUnidad)) {
                continue;
            }

            boolean haySolapamiento = candidata.getSecuenciaParadas().stream()
                    .anyMatch(parada -> pedidosCubiertos.contains(parada.getPedido()));

            if (!haySolapamiento && !candidata.getSecuenciaParadas().isEmpty()) {
                Ruta copia = Solucion.copiarRuta(candidata);
                EvaluadorCostos.recalcularRuta(copia, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
                rutasSeleccionadas.add(copia);
                copia.getSecuenciaParadas().forEach(parada -> pedidosCubiertos.add(parada.getPedido()));
                unidadesUsadas.add(idUnidad);
            }
        }

        for (UnidadTransporte unidad : contexto.vehiculos()) {
            if (!unidadesUsadas.contains(unidad.getIdUnidad())) {
                Ruta rutaVacia = new Ruta(unidad.getIdUnidad() + "-vacia", contexto.marcaTiempoActual(), unidad);
                EvaluadorCostos.recalcularRuta(rutaVacia, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
                rutasSeleccionadas.add(rutaVacia);
            }
        }

        Solucion resultado = new Solucion();
        resultado.getRutas().addAll(rutasSeleccionadas);

        for (Pedido pedido : todosPedidos) {
            if (!pedidosCubiertos.contains(pedido)) {
                resultado.getPedidosNoAsignados().add(pedido);
            }
        }

        return resultado;
    }
}
