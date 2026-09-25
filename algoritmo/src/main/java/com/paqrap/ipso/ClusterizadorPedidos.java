package com.paqrap.ipso;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.UnidadTransporte;

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
            List<Almacen> almacenes, LocalDateTime instanteReferencia) {

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

            while (true) {
                Pedido candidato = siguienteMasCercanoQueQuepa(pendientes, cargaAcumulada, unidad, referenciaCercania,
                        almacenAsignado);
                if (candidato == null) {
                    break;
                }
                lote.pedidos.add(candidato);
                pendientes.remove(candidato);
                cargaAcumulada += candidato.getCantidadSolicitada();
                referenciaCercania = candidato.getDestino();
            }

            if (!lote.pedidos.isEmpty()) {
                almacenAsignado.descontarStock(cargaAcumulada);
                lotes.add(lote);
            }
        }

        return lotes;
    }

    private Pedido siguienteMasCercanoQueQuepa(List<Pedido> pendientes, int cargaAcumulada, UnidadTransporte unidad,
            Nodo referencia, Almacen almacen) {
        Pedido mejor = null;
        double mejorDistancia = Double.MAX_VALUE;
        for (Pedido p : pendientes) {
            int cargaSiSeAgrega = cargaAcumulada + p.getCantidadSolicitada();
            if (cargaSiSeAgrega > unidad.getTipoVehiculo().getCapacidad()) {
                continue;
            }
            if (!almacen.tieneStock(cargaSiSeAgrega)) {
                continue;
            }
            double dist = distanciaManhattan(p.getDestino(), referencia);
            if (dist < mejorDistancia) {
                mejorDistancia = dist;
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
