package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.EvaluadorCostos;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.Comparator;
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

    /**
     * Peso de la urgencia en la puntuación de inserción de los operadores de reparación. Antes de
     * este ajuste, ningún operador (Voraz, Regret, Regret con Ruido) consideraba el plazo del
     * pedido al decidir a cuál insertar primero -- solo costo (Voraz) o "regret" de costo entre
     * opciones (Regret/RegretRuido), ambos ciegos a qué tan cerca está de incumplir. No cambia el
     * ciclo destruir-reparar-aceptar-reponderar de ALNS, solo el criterio de selección dentro de
     * la reparación -- mismo tipo de ajuste que ya hace DestruccionShaw combinando distancia y
     * similitud de plazo.
     *
     * <p>Valor calibrado empíricamente con IPSO (barrido 0/50/100/200/500 sobre el escenario de
     * estrés de septiembre 2028, ver [[project-paqrap-experimentacion]] y
     * {@link com.paqrap.ipso.ClusterizadorPedidos#PESO_URGENCIA}): un peso alto resultó
     * contraproducente -- forzar la atención de un pedido urgente-pero-lejano retiene más tiempo
     * al vehículo, compitiendo contra el factor que de verdad domina la supervivencia del sistema
     * (rotación rápida de flota). Se aplica el mismo valor aquí por consistencia entre algoritmos,
     * aunque el barrido específico se corrió sobre IPSO, no sobre ALNS.
     */
    static final double PESO_URGENCIA = 50.0;

    /**
     * Bono que crece mientras menos horas falten para el plazo del pedido -- domina sobre
     * diferencias de costo/regret normales cuando el pedido está realmente en riesgo de incumplir,
     * sin alterar el orden habitual entre pedidos con holgura cómoda.
     */
    static double bonoUrgencia(Pedido pedido, java.time.LocalDateTime instanteReferencia) {
        double horasHastaLimite = java.time.Duration.between(instanteReferencia, pedido.getFechaLimite()).toMinutes() / 60.0;
        return PESO_URGENCIA / Math.max(horasHastaLimite, 0.1);
    }

    /**
     * Tope de rutas evaluadas por pedido en los operadores de reparación. Antes de esto, cada
     * pedido se probaba contra TODAS las rutas de la solución (hasta 37, una por vehículo) × todas
     * sus posiciones -- con las rutas acotadas hoy a {@code maxParadasPorRuta} paradas, copiar y
     * recalcular una ruta individual ya es barato, así que el costo real por iteración lo domina
     * la CANTIDAD de rutas evaluadas, no el tamaño de cada una. Reducir a las más cercanas
     * geográficamente recorta ese costo sin cambiar el resultado en la inmensa mayoría de los
     * casos (una ruta lejana rara vez es la mejor opción de todas formas).
     */
    static final int MAX_RUTAS_CANDIDATAS = 10;

    /**
     * Las {@link #MAX_RUTAS_CANDIDATAS} rutas más cercanas al destino del pedido, usando como
     * referencia de cada ruta su última parada (o la posición actual del vehículo si aún no tiene
     * paradas). Si hay pocas rutas para empezar, se devuelven todas sin filtrar.
     */
    static List<Ruta> rutasCandidatas(List<Ruta> todasLasRutas, Pedido pedido) {
        if (todasLasRutas.size() <= MAX_RUTAS_CANDIDATAS) {
            return todasLasRutas;
        }
        Nodo destino = pedido.getDestino();
        return todasLasRutas.stream()
                .sorted(Comparator.comparingInt(r -> distanciaReferenciaRuta(r, destino)))
                .limit(MAX_RUTAS_CANDIDATAS)
                .toList();
    }

    private static int distanciaReferenciaRuta(Ruta ruta, Nodo destino) {
        Nodo referencia = ruta.getSecuenciaParadas().isEmpty()
                ? ruta.getUnidadTransporte().getPosicion()
                : ruta.getSecuenciaParadas().get(ruta.getSecuenciaParadas().size() - 1).getPedido().getDestino();
        return Math.abs(referencia.x() - destino.x()) + Math.abs(referencia.y() - destino.y());
    }
}
