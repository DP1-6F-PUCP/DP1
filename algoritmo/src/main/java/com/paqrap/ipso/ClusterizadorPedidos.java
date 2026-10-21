package com.paqrap.ipso;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
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
 *
 * <p>Investigación directa (pedido del usuario: "qué necesitaría IPSO para no envidiarle nada a
 * ALNS" en cumplimiento de plazos, tras el experimento comparativo histórico donde IPSO
 * pctATiempo caía hasta 64.44% -- ver [[project-paqrap-experimentacion]]) encontró tres causas
 * reales en esta clase, todas corregidas aquí:
 * <ol>
 *   <li>Distancia Manhattan en vez de {@link CalculadorDistancia} (ignoraba bloqueos vigentes) --
 *       un pedido podía parecer factible al clusterizar y resultar tarde de verdad una vez que la
 *       ruta real tenía que rodear un bloqueo.</li>
 *   <li>Orden de vehículos fijo por posición en {@code flotaDisponible} (típicamente por id) en
 *       vez de por cercanía real al pedido más urgente pendiente -- el pedido correcto podía no
 *       llegar al vehículo correcto solo por el orden arbitrario de la lista.</li>
 *   <li>Sin pasada de rescate: un pedido que no cabía por plazo en NINGÚN vehículo quedaba
 *       pendiente para siempre, lote tras lote, sin que nada cambiara (nunca se reevaluaba con un
 *       criterio más laxo). Mejor entregarlo tarde que nunca.</li>
 * </ol>
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
            double tiempoServicioHoras, Ciudad ciudad, List<Bloqueo> bloqueos) {

        List<Pedido> pendientes = new ArrayList<>(pedidosPendientes);
        pendientes.sort(Comparator.comparing(Pedido::getFechaLimite));

        List<UnidadTransporte> vehiculosDisponibles = new ArrayList<>();
        for (UnidadTransporte unidad : flotaDisponible) {
            if (unidad.estaDisponibleParaRuta(instanteReferencia)) {
                vehiculosDisponibles.add(unidad);
            }
        }

        // Orden por cercania real al pedido MAS urgente pendiente (no por id de flota) -- el
        // vehiculo mejor posicionado para rescatar lo mas urgente se sirve primero. Reordenar una
        // sola vez (no recalcular por cada pedido asignado) es un compromiso deliberado: captura
        // la mayor parte del beneficio sin convertir esto en una busqueda global tipo ALNS.
        if (!pendientes.isEmpty()) {
            Nodo destinoMasUrgente = pendientes.get(0).getDestino();
            vehiculosDisponibles.sort(Comparator.comparingDouble(u ->
                    CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia, u.getPosicion(), destinoMasUrgente)));
        }

        List<LoteVehiculo> lotes = new ArrayList<>();
        for (UnidadTransporte unidad : vehiculosDisponibles) {
            if (pendientes.isEmpty()) {
                break;
            }
            LoteVehiculo lote = llenarLote(unidad, pendientes, almacenes, instanteReferencia, maxParadasPorRuta,
                    tiempoServicioHoras, ciudad, bloqueos, true);
            if (lote != null) {
                lotes.add(lote);
            }
        }

        // Pasada de rescate (sin chequeo de plazo): un pedido que no cupo por plazo en NINGUN
        // vehiculo en la pasada anterior queda aqui -- en vez de dejarlo pendiente para siempre
        // (bug real encontrado), se reintenta sin la restriccion de factibilidad temporal, solo
        // con capacidad/stock, contra los vehiculos que todavia tengan espacio libre. Entregar
        // tarde es preferible a no entregar nunca.
        for (UnidadTransporte unidad : vehiculosDisponibles) {
            if (pendientes.isEmpty()) {
                break;
            }
            LoteVehiculo existente = lotes.stream().filter(l -> l.unidad == unidad).findFirst().orElse(null);
            if (existente != null && existente.pedidos.size() >= maxParadasPorRuta) {
                continue;
            }
            LoteVehiculo lote = existente != null
                    ? continuarLote(existente, pendientes, instanteReferencia, maxParadasPorRuta, tiempoServicioHoras,
                            ciudad, bloqueos, false)
                    : llenarLote(unidad, pendientes, almacenes, instanteReferencia, maxParadasPorRuta,
                            tiempoServicioHoras, ciudad, bloqueos, false);
            if (lote != null && existente == null) {
                lotes.add(lote);
            }
        }

        return lotes;
    }

    /**
     * Crea el lote de {@code unidad} desde cero (asigna almacén con stock) y lo llena.
     * {@code null} si no hay almacén con stock disponible o no se pudo asignar ningún pedido.
     */
    private LoteVehiculo llenarLote(UnidadTransporte unidad, List<Pedido> pendientes, List<Almacen> almacenes,
            LocalDateTime instanteReferencia, int maxParadasPorRuta, double tiempoServicioHoras, Ciudad ciudad,
            List<Bloqueo> bloqueos, boolean respetarPlazo) {
        Almacen almacenAsignado = almacenMasCercanoConStock(unidad, almacenes, pendientes.get(0), instanteReferencia,
                ciudad, bloqueos);
        if (almacenAsignado == null) {
            return null;
        }
        LoteVehiculo lote = new LoteVehiculo(unidad, almacenAsignado);
        LoteVehiculo resultado = continuarLote(lote, pendientes, instanteReferencia, maxParadasPorRuta,
                tiempoServicioHoras, ciudad, bloqueos, respetarPlazo);
        return resultado != null && !lote.pedidos.isEmpty() ? lote : null;
    }

    /** Sigue llenando un lote ya existente (nuevo o de una pasada anterior) hasta
     * {@code maxParadasPorRuta} o hasta que no quede ningún candidato que quepa. */
    private LoteVehiculo continuarLote(LoteVehiculo lote, List<Pedido> pendientes, LocalDateTime instanteReferencia,
            int maxParadasPorRuta, double tiempoServicioHoras, Ciudad ciudad, List<Bloqueo> bloqueos,
            boolean respetarPlazo) {
        int cargaAcumulada = lote.pedidos.stream().mapToInt(Pedido::getCantidadSolicitada).sum();
        Nodo referenciaCercania = lote.pedidos.isEmpty()
                ? lote.almacen.getPosicion()
                : lote.pedidos.get(lote.pedidos.size() - 1).getDestino();
        double horasComprometidas = horasComprometidasDesde(lote, tiempoServicioHoras, ciudad, bloqueos,
                instanteReferencia);

        while (lote.pedidos.size() < maxParadasPorRuta) {
            Pedido candidato = siguienteMasCercanoQueQuepa(pendientes, cargaAcumulada, lote.unidad, referenciaCercania,
                    lote.almacen, instanteReferencia, horasComprometidas, ciudad, bloqueos, respetarPlazo);
            if (candidato == null) {
                break;
            }
            double horasViaje = CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia,
                    referenciaCercania, candidato.getDestino()) / lote.unidad.getTipoVehiculo().getVelocidadKmH();
            horasComprometidas += horasViaje + tiempoServicioHoras;
            lote.pedidos.add(candidato);
            pendientes.remove(candidato);
            cargaAcumulada += candidato.getCantidadSolicitada();
            referenciaCercania = candidato.getDestino();
            lote.almacen.descontarStock(candidato.getCantidadSolicitada(), instanteReferencia);
        }
        return lote;
    }

    /** Recalcula cuántas horas ya están comprometidas por las paradas que un lote ya tiene,
     * caminando desde el almacén -- necesario para la pasada de rescate, que puede retomar un
     * lote que ya traía paradas de la pasada anterior. */
    private double horasComprometidasDesde(LoteVehiculo lote, double tiempoServicioHoras, Ciudad ciudad,
            List<Bloqueo> bloqueos, LocalDateTime instanteReferencia) {
        double horas = 0.0;
        Nodo referencia = lote.almacen.getPosicion();
        for (Pedido p : lote.pedidos) {
            double horasViaje = CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia, referencia,
                    p.getDestino()) / lote.unidad.getTipoVehiculo().getVelocidadKmH();
            horas += horasViaje + tiempoServicioHoras;
            referencia = p.getDestino();
        }
        return horas;
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
            Nodo referencia, Almacen almacen, LocalDateTime instanteReferencia, double horasComprometidas,
            Ciudad ciudad, List<Bloqueo> bloqueos, boolean respetarPlazo) {
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
            double dist = CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia, referencia, p.getDestino());
            double horasHastaLimite = Duration.between(instanteReferencia, p.getFechaLimite()).toMinutes() / 60.0;
            // Factibilidad real, no solo capacidad: si ni siquiera el viaje directo desde donde
            // termina el despacho hasta ahora alcanza a llegar antes del plazo, no tiene sentido
            // comprometerlo -- antes, cualquier pedido que cupiera por capacidad podía entrar,
            // aunque fuera matemáticamente imposible entregarlo a tiempo. Se omite en la pasada de
            // rescate (respetarPlazo=false): mejor tarde que nunca.
            double horasViaje = dist / unidad.getTipoVehiculo().getVelocidadKmH();
            if (respetarPlazo && horasComprometidas + horasViaje > horasHastaLimite) {
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

    private Almacen almacenMasCercanoConStock(UnidadTransporte unidad, List<Almacen> almacenes, Pedido referencia,
            LocalDateTime instanteReferencia, Ciudad ciudad, List<Bloqueo> bloqueos) {
        Almacen mejor = null;
        double mejorDistancia = Double.MAX_VALUE;
        for (Almacen a : almacenes) {
            if (!a.tieneStock(referencia.getCantidadSolicitada())) {
                continue;
            }
            double dist = CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia, a.getPosicion(),
                    unidad.getPosicion());
            if (dist < mejorDistancia) {
                mejorDistancia = dist;
                mejor = a;
            }
        }
        return mejor;
    }
}
