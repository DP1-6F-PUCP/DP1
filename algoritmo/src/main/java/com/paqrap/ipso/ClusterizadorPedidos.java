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
import java.util.Set;

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
        /** Unidades que esta unidad lleva de cada pedido (entregas parciales: puede ser menos que lo solicitado). */
        public final Map<Pedido, Integer> cantidades = new LinkedHashMap<>();

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
        /** Km desde la posición inicial hasta cada almacén (se reutiliza entre pedidos candidatos). */
        final Map<Almacen, Double> kmHastaAlmacen = new java.util.HashMap<>();
        /** Paquetes que ya lleva a bordo fuera de un almacén (sirven sin volver a cargar). */
        int aBordo;

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

        List<Plan> planes = new ArrayList<>();
        for (UnidadTransporte unidad : flotaDisponible) {
            if (unidad.estaDisponibleParaRuta(instanteReferencia)) {
                Plan plan = new Plan(unidad, instanteReferencia, operacion,
                        proximoMantenimiento(unidad, mantenimientos, instanteReferencia));
                boolean enAlmacen = almacenes.stream().anyMatch(a -> a.getPosicion().equals(unidad.getPosicion()));
                plan.aBordo = enAlmacen ? 0 : unidad.getCargaABordo();
                planes.add(plan);
            }
        }

        // Postergación indefinida: en cada lote se reordena TODO lo pendiente por fecha límite (EDF), de
        // modo que un pedido que no se pudo asignar sube de prioridad lote a lote y nunca queda
        // detrás de pedidos que llegaron después con plazo más holgado. Además, lo comprometido en
        // rutas en curso se descuenta (cantidadPorPlanificar) y el saldo vuelve a la cola.
        //
        // Parámetros (propiedades del sistema), medidos con el banco 5D sobre 16 fechas (días hasta
        // el colapso, promedio; mayor es mejor), tras corregir el refrigerio a mitad de servicio:
        //   orden=edf     parcial=necesaria 2.97   <- por defecto
        //   orden=edf     parcial=urgente:4 2.83
        //   orden=holgura parcial=necesaria 2.73
        //   orden=holgura parcial=urgente:4 2.54
        //   orden=edf     parcial=siempre   2.44
        //   orden=holgura parcial=siempre   2.26
        // Tras exigir que la unidad pase por un almacén a cargar (antes casi la mitad de los despachos
        // salían cargados desde la calle), el mismo banco da: necesaria 1.86, urgente:4 1.78; con
        // abandono=todas 1.64 y abandono=afectadas 1.36. Se mantienen edf + necesaria + urgencia:4.
        // "necesaria": el pedido se divide entre vehículos solo si supera la capacidad del tipo más
        // grande de la flota (los pedidos grandes que el profesor anticipa desde ago-2028); dividir de
        // más gasta capacidad de flota en viajes extra y adelanta el colapso.
        List<Pedido> pendientes = new ArrayList<>(pedidosPendientes);
        Map<Pedido, LocalDateTime> holgura = new java.util.HashMap<>();
        for (Pedido p : pendientes) {
            double horasMin = planes.stream()
                    .mapToDouble(pl -> (Math.abs(pl.posicion.x() - p.getDestino().x())
                            + Math.abs(pl.posicion.y() - p.getDestino().y())) * (double) ciudad.distanciaEntreNodos()
                            / pl.unidad.getTipoVehiculo().getVelocidadKmH())
                    .min().orElse(0.0);
            holgura.put(p, p.getFechaLimite().minusSeconds(Math.round(horasMin * 3600.0)));
        }
        String modoOrden = System.getProperty("paqrap.orden", "edf");
        String modoParcial = System.getProperty("paqrap.parcial", "necesaria");
        if ("edf".equals(modoOrden)) {
            pendientes.sort(Comparator.comparing(Pedido::getFechaLimite));
        } else {
            pendientes.sort(Comparator.comparing(holgura::get));
        }
        // Capacidad del tipo más grande de la FLOTA (no solo de las libres ahora): un pedido que cabe en
        // un auto no se divide solo porque en este instante los autos estén ocupados.
        int capacidadMaxima = flotaDisponible.stream().mapToInt(u -> u.getTipoVehiculo().getCapacidad()).max().orElse(0);

        long servicioSeg = Math.round(operacion.tiempoServicioClienteHoras() * 3600.0);
        long refrigerioSeg = Math.round(operacion.duracionRefrigerioHoras() * 3600.0);
        Map<UnidadTransporte, LoteVehiculo> lotes = new LinkedHashMap<>();

        for (Pedido pedido : pendientes) {
            int restante = pedido.cantidadPorPlanificar();
            Set<Plan> usados = new java.util.HashSet<>();
            while (restante > 0) {
                // Candidatas: llegan a tiempo y tienen espacio libre (aunque no alcance para todo).
                List<Candidato> candidatos = new ArrayList<>();
                for (Plan plan : planes) {
                    if (usados.contains(plan)) {
                        continue; // una unidad lleva una sola parte de cada pedido
                    }
                    int paradas = plan.lote == null ? 0 : plan.lote.pedidos.size();
                    int libre = plan.unidad.getTipoVehiculo().getCapacidad() - plan.carga;
                    if (paradas >= maxParadasPorRuta || libre <= 0) {
                        continue;
                    }
                    int parte = Math.min(restante, libre);
                    Almacen almacen;
                    Llegada llegada;
                    if (plan.lote != null) {
                        // Ya tiene pedidos: sigue de cliente en cliente con la misma fuente de carga
                        // (el almacén donde carga, o lo que ya lleva a bordo si almacen es null).
                        almacen = plan.lote.almacen;
                        boolean alcanza = almacen != null ? almacen.tieneStock(parte) : plan.carga + parte <= plan.aBordo;
                        llegada = alcanza ? estimarLlegada(plan, pedido, ciudad, bloqueos, refrigerioSeg, null) : null;
                    } else if (plan.aBordo >= parte) {
                        // Venía de una ruta replanificada con paquetes a bordo: el producto es uno solo,
                        // así que los entrega a este cliente sin volver a cargar.
                        almacen = null;
                        llegada = estimarLlegada(plan, pedido, ciudad, bloqueos, refrigerioSeg, null);
                    } else {
                        // Primer pedido de la unidad: debe cargar en un almacén con stock. Si ya está en
                        // uno, sale de ahí; si no (volvía vacía), se elige el almacén que la deja antes
                        // en el cliente pasando a cargar.
                        almacen = null;
                        llegada = null;
                        Almacen aqui = almacenes.stream()
                                .filter(a -> a.getPosicion().equals(plan.posicion) && a.tieneStock(parte))
                                .findFirst().orElse(null);
                        for (Almacen a : aqui != null ? List.of(aqui) : almacenes) {
                            if (!a.tieneStock(parte)) {
                                continue;
                            }
                            Llegada l = estimarLlegada(plan, pedido, ciudad, bloqueos, refrigerioSeg, aqui != null ? null : a);
                            if (l != null && (llegada == null || l.instante().isBefore(llegada.instante()))) {
                                llegada = l;
                                almacen = a;
                            }
                        }
                    }
                    if (llegada == null || llegada.instante().isAfter(pedido.getFechaLimite())) {
                        continue;
                    }
                    LocalDateTime finServicio = llegada.instante().plusSeconds(servicioSeg);
                    // Q&A (nota 2 del plan de mantenimiento): "eso deben evitarlo en la planificación".
                    if (plan.inicioMantenimiento != null && finServicio.isAfter(plan.inicioMantenimiento)) {
                        continue;
                    }
                    candidatos.add(new Candidato(plan, almacen, llegada, parte));
                }
                if (candidatos.isEmpty()) {
                    break; // lo que falte queda pendiente para el próximo lote
                }
                final int falta = restante;
                List<Candidato> completas = candidatos.stream().filter(c -> c.parte() == falta).toList();
                boolean puedeDividir = "siempre".equals(modoParcial) || falta > capacidadMaxima
                        || (modoParcial.startsWith("urgente:") && pedido.getFechaLimite().isBefore(instanteReferencia
                                .plusMinutes(Math.round(Double.parseDouble(modoParcial.substring(8)) * 60))));
                if (completas.isEmpty() && !puedeDividir) {
                    break; // todavía hay tiempo: esperar a una unidad que lo lleve completo
                }
                Candidato elegido;
                if (!completas.isEmpty()) {
                    // Una sola unidad puede llevar todo lo que falta: mismo criterio de antes, la que
                    // llega antes y, entre las casi igual de rápidas, la de menor capacidad suficiente.
                    LocalDateTime mejor = completas.stream().map(c -> c.llegada().instante()).min(LocalDateTime::compareTo).get();
                    LocalDateTime tope = mejor.plusSeconds(Math.round(MARGEN_EMPATE_HORAS * 3600.0));
                    elegido = completas.stream()
                            .filter(c -> !c.llegada().instante().isAfter(tope))
                            .min(Comparator.<Candidato>comparingInt(c -> c.plan().unidad.getTipoVehiculo().getCapacidad())
                                    .thenComparing(c -> c.llegada().instante()))
                            .get();
                } else {
                    // Entrega parcial: ninguna unidad lleva todo a tiempo. Se toma la parte más grande
                    // posible de la unidad que llega antes y se repite con lo que falte.
                    elegido = candidatos.stream()
                            .min(Comparator.<Candidato, LocalDateTime>comparing(c -> c.llegada().instante())
                                    .thenComparing(Comparator.comparingInt(Candidato::parte).reversed()))
                            .get();
                }

                Plan plan = elegido.plan();
                if (plan.lote == null) {
                    plan.lote = new LoteVehiculo(plan.unidad, elegido.almacen());
                    lotes.put(plan.unidad, plan.lote);
                }
                plan.lote.pedidos.add(pedido);
                plan.lote.cantidades.put(pedido, elegido.parte());
                plan.carga += elegido.parte();
                plan.posicion = pedido.getDestino();
                plan.libreDesde = elegido.llegada().instante().plusSeconds(servicioSeg);
                plan.refrigerioTomado = plan.refrigerioTomado || elegido.llegada().tomoRefrigerio();
                if (plan.lote.almacen != null) {
                    plan.lote.almacen.descontarStock(elegido.parte(), instanteReferencia);
                }
                usados.add(plan);
                restante -= elegido.parte();
            }
        }

        return new ArrayList<>(lotes.values());
    }

    private record Llegada(LocalDateTime instante, boolean tomoRefrigerio) {
    }

    private record Candidato(Plan plan, Almacen almacen, Llegada llegada, int parte) {
    }

    /** Llegada del vehículo a {@code pedido} desde donde queda libre, con el refrigerio obligatorio
     * si corresponde antes de salir (mismo criterio que MotorSimulacion). Con {@code cargarEn}, el
     * viaje pasa primero por ese almacén a cargar. null si no hay camino. */
    private Llegada estimarLlegada(Plan plan, Pedido pedido, Ciudad ciudad, List<Bloqueo> bloqueos, long refrigerioSeg,
            Almacen cargarEn) {
        LocalDateTime salida = plan.libreDesde.isBefore(pedido.getFechaIngreso()) ? pedido.getFechaIngreso() : plan.libreDesde;
        boolean tomoRefrigerio = false;
        if (!plan.refrigerioTomado && !salida.isBefore(plan.refrigerioIdeal)) {
            salida = salida.plusSeconds(refrigerioSeg);
            tomoRefrigerio = true;
        }
        double km;
        try {
            if (cargarEn != null) {
                final LocalDateTime salidaFinal = salida;
                Double hastaAlmacen = plan.kmHastaAlmacen.get(cargarEn);
                if (hastaAlmacen == null) {
                    hastaAlmacen = CalculadorDistancia.distanciaKm(ciudad, bloqueos, salidaFinal, plan.posicion,
                            cargarEn.getPosicion());
                    plan.kmHastaAlmacen.put(cargarEn, hastaAlmacen);
                }
                km = hastaAlmacen + CalculadorDistancia.distanciaKm(ciudad, bloqueos, salida, cargarEn.getPosicion(),
                        pedido.getDestino());
            } else {
                km = CalculadorDistancia.distanciaKm(ciudad, bloqueos, salida, plan.posicion, pedido.getDestino());
            }
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
