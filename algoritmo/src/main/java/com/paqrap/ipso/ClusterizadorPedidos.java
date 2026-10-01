package com.paqrap.ipso;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.UnidadTransporte;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Agrupa los pedidos pendientes en lotes por unidad de transporte, respetando la capacidad
 * máxima de cada vehículo, la disponibilidad de stock del almacén asignado (central o
 * intermedio) y la prioridad de atención según el plazo comprometido.
 *
 * <p>Esta clusterización previa (cluster-first / route-second) es necesaria porque IPSO resuelve
 * una sola permutación por ejecución; aquí cada lote resultante es exactamente la instancia de
 * TSP que resolverá {@link com.paqrap.ipso.nucleo.IPSOOptimizador} para un vehículo.
 */
public class ClusterizadorPedidos {

    public static class LoteVehiculo {
        public final UnidadTransporte unidad;
        public final Almacen almacen;
        public final List<Pedido> pedidos = new ArrayList<>();

        public LoteVehiculo(UnidadTransporte unidad, Almacen almacen) {
            this.unidad = unidad;
            this.almacen = almacen;
        }
    }

    public List<LoteVehiculo> clusterizar(List<Pedido> pedidosPendientes, List<UnidadTransporte> flotaDisponible,
            List<Almacen> almacenes, LocalDateTime instanteReferencia, int maxParadasPorRuta,
            double tiempoServicioHoras) {

        List<Pedido> pendientes = new ArrayList<>(pedidosPendientes);
        pendientes.sort(Comparator.comparing(Pedido::getFechaLimite));

        List<LoteVehiculo> lotes = new ArrayList<>();

        for (UnidadTransporte unidad : flotaDisponible) {
            if (pendientes.isEmpty() || !unidad.estaDisponibleParaRuta(instanteReferencia)) {
                continue;
            }

            Almacen almacenAsignado = almacenMasCercanoConStock(unidad, almacenes, pendientes.get(0));
            if (almacenAsignado == null) {
                continue;
            }

            LoteVehiculo lote = new LoteVehiculo(unidad, almacenAsignado);
            int cargaAcumulada = 0;
            Nodo referenciaCercania = almacenAsignado.getPosicion();
            // Horas ya comprometidas por las paradas que lleva este despacho hasta ahora (viaje +
            // servicio de cada una) -- se usa para descartar candidatos que, aunque quepan por
            // capacidad, ya no se alcanzarían a entregar a tiempo dado lo que el vehículo ya tiene
            // por delante. Antes de esto, la única restricción real era capacidad: un pedido podía
            // comprometerse aunque fuera matemáticamente imposible llegar a tiempo.
            double horasComprometidas = 0.0;

            while (lote.pedidos.size() < maxParadasPorRuta) {
                Pedido candidato = siguienteMasCercanoQueQuepa(pendientes, cargaAcumulada, unidad, referenciaCercania,
                        almacenAsignado, instanteReferencia, horasComprometidas);
                if (candidato == null) {
                    break;
                }
                double horasViaje = distanciaManhattan(candidato.getDestino(), referenciaCercania)
                        / unidad.getTipoVehiculo().getVelocidadKmH();
                horasComprometidas += horasViaje + tiempoServicioHoras;
                lote.pedidos.add(candidato);
                pendientes.remove(candidato);
                cargaAcumulada += candidato.getCantidadSolicitada();
                referenciaCercania = candidato.getDestino();
            }

            if (!lote.pedidos.isEmpty()) {
                almacenAsignado.descontarStock(cargaAcumulada, instanteReferencia);
                lotes.add(lote);
            }
        }

        return lotes;
    }

    /**
     * Peso de la urgencia en la puntuación de selección. Antes de este ajuste, el criterio era
     * distancia pura -- un pedido con plazo de 4h lejos del vehículo podía quedarse esperando
     * mientras se atendía primero uno con plazo de 36h pero más cerca, sin que la urgencia pesara
     * en absoluto en la decisión real de asignación (el orden por plazo de {@link #clusterizar}
     * solo se usaba para elegir el almacén del primer vehículo, no para esto).
     *
     * <p>Calibrado empíricamente (barrido 0/50/100/200/500 sobre el escenario de estrés de
     * septiembre 2028, ver [[project-paqrap-experimentacion]]): un peso alto es contraproducente
     * -- forzar la atención de un pedido urgente-pero-lejano genera despachos menos eficientes que
     * retienen más tiempo al vehículo, compitiendo contra el factor que de verdad domina la
     * supervivencia del sistema (rotación rápida de flota, no calidad individual de cada ruta).
     * 50 dio el mejor resultado (55 entregados antes del primer incumplido, vs. 50 con el 100
     * usado originalmente sin calibrar).
     */
    private static final double PESO_URGENCIA = 50.0;

    private Pedido siguienteMasCercanoQueQuepa(List<Pedido> pendientes, int cargaAcumulada, UnidadTransporte unidad,
            Nodo referencia, Almacen almacen, LocalDateTime instanteReferencia, double horasComprometidas) {
        Pedido mejor = null;
        double mejorPuntaje = Double.MAX_VALUE;
        for (Pedido p : pendientes) {
            int cargaSiSeAgrega = cargaAcumulada + p.getCantidadSolicitada();
            if (cargaSiSeAgrega > unidad.getTipoVehiculo().getCapacidad()) {
                continue;
            }
            if (!almacen.tieneStock(cargaSiSeAgrega)) {
                continue;
            }
            double dist = distanciaManhattan(p.getDestino(), referencia);
            double horasHastaLimite = Duration.between(instanteReferencia, p.getFechaLimite()).toMinutes() / 60.0;
            // Factibilidad real, no solo capacidad: si ni siquiera el viaje directo desde donde
            // termina el despacho hasta ahora alcanza a llegar antes del plazo, no tiene sentido
            // comprometerlo -- antes, cualquier pedido que cupiera por capacidad podía entrar,
            // aunque fuera matemáticamente imposible entregarlo a tiempo.
            double horasViaje = dist / unidad.getTipoVehiculo().getVelocidadKmH();
            if (horasComprometidas + horasViaje > horasHastaLimite) {
                continue;
            }
            double urgencia = PESO_URGENCIA / Math.max(horasHastaLimite, 0.1);
            double puntaje = dist + urgencia;
            if (puntaje < mejorPuntaje) {
                mejorPuntaje = puntaje;
                mejor = p;
            }
        }
        return mejor;
    }

    private Almacen almacenMasCercanoConStock(UnidadTransporte unidad, List<Almacen> almacenes, Pedido referencia) {
        Almacen mejor = null;
        double mejorDistancia = Double.MAX_VALUE;
        for (Almacen a : almacenes) {
            if (!a.tieneStock(referencia.getCantidadSolicitada())) {
                continue;
            }
            double dist = distanciaManhattan(a.getPosicion(), unidad.getPosicion());
            if (dist < mejorDistancia) {
                mejorDistancia = dist;
                mejor = a;
            }
        }
        return mejor;
    }

    private double distanciaManhattan(Nodo a, Nodo b) {
        return Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y());
    }
}
