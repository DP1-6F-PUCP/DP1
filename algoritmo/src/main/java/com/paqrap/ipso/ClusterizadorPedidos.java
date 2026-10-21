package com.paqrap.ipso;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agrupa los pedidos pendientes en lotes por unidad de transporte (cluster-first / route-second):
 * cada lote resultante es la instancia que secuencia {@link com.paqrap.ipso.nucleo.IPSOOptimizador}
 * para un vehículo.
 *
 * <p><b>Asignación por urgencia</b> (rediseño tras un incumplimiento real reproducido en vivo,
 * CINCO_DIAS desde 2026-10-21: PED-2026-10-3958, plazo 4h en (70,45), nunca se asignó mientras se
 * le daban autos a pedidos que habían entrado DESPUÉS y vencían horas más tarde). La versión
 * anterior recorría los vehículos y a cada uno le daba "el pedido más cercano" (la urgencia pesaba
 * poco: 50/horas restantes contra decenas de km), así que un pedido urgente y lejano quedaba
 * siempre atrás hasta volverse imposible. Ahora:
 * <ol>
 *   <li>los pedidos se procesan del plazo más próximo al más lejano (EDF);</li>
 *   <li>cada uno va al vehículo que llega ANTES a tiempo -- calculado desde su posición REAL (no
 *       desde el almacén, como antes: los vehículos ya no siempre parten de un almacén), con la
 *       distancia real ({@link CalculadorDistancia}, respeta bloqueos), el servicio de las paradas
 *       previas y el refrigerio pendiente del turno;</li>
 *   <li>entre los que llegan casi igual de rápido se prefiere el de MENOR capacidad suficiente,
 *       para no gastar autos (los únicos que llevan pedidos grandes) en pedidos chicos.</li>
 * </ol>
 *
 * <p>Un pedido que no llega a tiempo con ningún vehículo queda {@code PENDIENTE} y vuelve a
 * competir en el próximo lote (igual que ALNS con {@code VerificadorRestricciones}): nunca se
 * fuerza un despacho que se sabe tarde -- la versión original tenía una "pasada de rescate" que lo
 * hacía ("mejor tarde que nunca"), contraria a la política de cero tolerancia del caso.
 */
public class ClusterizadorPedidos {

    /** Margen dentro del cual dos llegadas se consideran "igual de rápidas" (ver punto 3). */
    private static final double MARGEN_EMPATE_HORAS = 0.5;

    public static class LoteVehiculo {
        public final UnidadTransporte unidad;
        public final Almacen almacen;
        /** En orden de asignación (por urgencia) -- factible tal cual, por construcción. */
        public final List<Pedido> pedidos = new ArrayList<>();

        public LoteVehiculo(UnidadTransporte unidad, Almacen almacen) {
            this.unidad = unidad;
            this.almacen = almacen;
        }
    }

    /** Estado "en planificación" de un vehículo: dónde y cuándo queda libre tras sus paradas ya asignadas. */
    private static final class Plan {
        final UnidadTransporte unidad;
        final LocalDateTime inicioMantenimiento;
        final LocalDateTime refrigerioIdeal;
        Nodo posicion;
        LocalDateTime libreDesde;
        boolean refrigerioTomado;
        int carga;
        LoteVehiculo lote;

        Plan(UnidadTransporte unidad, LocalDateTime ahora, ConfiguracionOperacion operacion,
                LocalDateTime inicioMantenimiento) {
            this.unidad = unidad;
            this.inicioMantenimiento = inicioMantenimiento;
            this.posicion = unidad.getPosicion();
            this.libreDesde = ahora;
            LocalDateTime inicioTurno = operacion.inicioTurnoQueContiene(ahora);
            this.refrigerioIdeal = operacion.inicioRefrigerioMasTardio(inicioTurno);
            this.refrigerioTomado = inicioTurno.equals(unidad.getTiempoInicioTurnoActual()) && unidad.isRefrigerioTomado();
            // Refrigerio ya en curso (p. ej. una unidad que volvía al almacén): queda libre al terminarlo.
            LocalDateTime enCurso = unidad.getHoraRefrigerioProgramada();
            if (enCurso != null) {
                LocalDateTime fin = enCurso.plusSeconds(Math.round(operacion.duracionRefrigerioHoras() * 3600.0));
                if (fin.isAfter(libreDesde)) {
                    libreDesde = fin;
                }
                this.refrigerioTomado = true;
            }
        }
    }

    public List<LoteVehiculo> clusterizar(List<Pedido> pedidosPendientes, List<UnidadTransporte> flotaDisponible,
            List<Almacen> almacenes, LocalDateTime instanteReferencia, int maxParadasPorRuta,
            ConfiguracionOperacion operacion, Ciudad ciudad, List<Bloqueo> bloqueos, List<Mantenimiento> mantenimientos) {

        List<Pedido> pendientes = new ArrayList<>(pedidosPendientes);
        pendientes.sort(Comparator.comparing(Pedido::getFechaLimite));

        List<Plan> planes = new ArrayList<>();
        for (UnidadTransporte unidad : flotaDisponible) {
            if (unidad.estaDisponibleParaRuta(instanteReferencia)) {
                planes.add(new Plan(unidad, instanteReferencia, operacion,
                        proximoMantenimiento(unidad, mantenimientos, instanteReferencia)));
            }
        }

        long servicioSeg = Math.round(operacion.tiempoServicioClienteHoras() * 3600.0);
        long refrigerioSeg = Math.round(operacion.duracionRefrigerioHoras() * 3600.0);
        Map<UnidadTransporte, LoteVehiculo> lotes = new LinkedHashMap<>();

        for (Pedido pedido : pendientes) {
            int cantidad = pedido.getCantidadSolicitada();
            List<Candidato> candidatos = new ArrayList<>();
            for (Plan plan : planes) {
                int paradas = plan.lote == null ? 0 : plan.lote.pedidos.size();
                if (paradas >= maxParadasPorRuta || plan.carga + cantidad > plan.unidad.getTipoVehiculo().getCapacidad()) {
                    continue;
                }
                Almacen almacen = plan.lote != null ? plan.lote.almacen
                        : almacenMasCercanoConStock(plan.posicion, almacenes, cantidad, instanteReferencia, ciudad, bloqueos);
                if (almacen == null || !almacen.tieneStock(cantidad)) {
                    continue;
                }
                Llegada llegada = estimarLlegada(plan, pedido, ciudad, bloqueos, refrigerioSeg);
                if (llegada == null || llegada.instante().isAfter(pedido.getFechaLimite())) {
                    continue;
                }
                LocalDateTime finServicio = llegada.instante().plusSeconds(servicioSeg);
                // Q&A (nota 2 del plan de mantenimiento): "eso deben evitarlo en la planificación".
                if (plan.inicioMantenimiento != null && finServicio.isAfter(plan.inicioMantenimiento)) {
                    continue;
                }
                candidatos.add(new Candidato(plan, almacen, llegada));
            }
            if (candidatos.isEmpty()) {
                continue; // queda PENDIENTE para el próximo lote
            }

            LocalDateTime mejor = candidatos.stream().map(c -> c.llegada().instante()).min(LocalDateTime::compareTo).get();
            LocalDateTime tope = mejor.plusSeconds(Math.round(MARGEN_EMPATE_HORAS * 3600.0));
            Candidato elegido = candidatos.stream()
                    .filter(c -> !c.llegada().instante().isAfter(tope))
                    .min(Comparator.<Candidato>comparingInt(c -> c.plan().unidad.getTipoVehiculo().getCapacidad())
                            .thenComparing(c -> c.llegada().instante()))
                    .get();

            Plan plan = elegido.plan();
            if (plan.lote == null) {
                plan.lote = new LoteVehiculo(plan.unidad, elegido.almacen());
                lotes.put(plan.unidad, plan.lote);
            }
            plan.lote.pedidos.add(pedido);
            plan.carga += cantidad;
            plan.posicion = pedido.getDestino();
            plan.libreDesde = elegido.llegada().instante().plusSeconds(servicioSeg);
            plan.refrigerioTomado = plan.refrigerioTomado || elegido.llegada().tomoRefrigerio();
            plan.lote.almacen.descontarStock(cantidad, instanteReferencia);
        }

        return new ArrayList<>(lotes.values());
    }

    private record Llegada(LocalDateTime instante, boolean tomoRefrigerio) {
    }

    private record Candidato(Plan plan, Almacen almacen, Llegada llegada) {
    }

    /** Llegada del vehículo a {@code pedido} desde donde queda libre, con el refrigerio obligatorio
     * si corresponde antes de salir (mismo criterio que MotorSimulacion). null si no hay camino. */
    private Llegada estimarLlegada(Plan plan, Pedido pedido, Ciudad ciudad, List<Bloqueo> bloqueos, long refrigerioSeg) {
        LocalDateTime salida = plan.libreDesde.isBefore(pedido.getFechaIngreso()) ? pedido.getFechaIngreso() : plan.libreDesde;
        boolean tomoRefrigerio = false;
        if (!plan.refrigerioTomado && !salida.isBefore(plan.refrigerioIdeal)) {
            salida = salida.plusSeconds(refrigerioSeg);
            tomoRefrigerio = true;
        }
        double km;
        try {
            km = CalculadorDistancia.distanciaKm(ciudad, bloqueos, salida, plan.posicion, pedido.getDestino());
        } catch (IllegalStateException sinCamino) {
            return null;
        }
        double horas = km / plan.unidad.getTipoVehiculo().getVelocidadKmH();
        LocalDateTime llegada = salida.plusSeconds(Math.round(horas * 3600.0));
        // Si el viaje cruza el último inicio permitido, el refrigerio se toma en el camino (mismo
        // criterio que MotorSimulacion.recorrerCamino): la llegada se corre un refrigerio entero.
        if (!plan.refrigerioTomado && !tomoRefrigerio && llegada.isAfter(plan.refrigerioIdeal)) {
            llegada = llegada.plusSeconds(refrigerioSeg);
            tomoRefrigerio = true;
        }
        return new Llegada(llegada, tomoRefrigerio);
    }

    private Almacen almacenMasCercanoConStock(Nodo posicion, List<Almacen> almacenes, int cantidad,
            LocalDateTime instanteReferencia, Ciudad ciudad, List<Bloqueo> bloqueos) {
        Almacen mejor = null;
        double mejorDistancia = Double.MAX_VALUE;
        for (Almacen a : almacenes) {
            if (!a.tieneStock(cantidad)) {
                continue;
            }
            double dist;
            try {
                dist = CalculadorDistancia.distanciaKm(ciudad, bloqueos, instanteReferencia, a.getPosicion(), posicion);
            } catch (IllegalStateException sinCamino) {
                continue;
            }
            if (dist < mejorDistancia) {
                mejorDistancia = dist;
                mejor = a;
            }
        }
        return mejor;
    }

    /** Siguiente mantenimiento programado de {@code unidad} posterior a {@code instanteReferencia},
     * o {@code null} si no tiene ninguno. */
    private LocalDateTime proximoMantenimiento(UnidadTransporte unidad, List<Mantenimiento> mantenimientos,
            LocalDateTime instanteReferencia) {
        return mantenimientos.stream()
                .filter(m -> m.vehiculoAfectado() == unidad)
                .map(Mantenimiento::fechaInicio)
                .filter(inicio -> inicio.isAfter(instanteReferencia))
                .min(LocalDateTime::compareTo)
                .orElse(null);
    }
}
