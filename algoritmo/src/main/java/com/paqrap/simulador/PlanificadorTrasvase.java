package com.paqrap.simulador;

import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Trasvase: rescata los paquetes que quedaron a bordo de una unidad averiada.
 *
 * <p>Regla del curso (clases del profesor): una unidad averiada que todavía está en el sitio es un
 * "almacén móvil". Otra unidad puede ir hasta ella, recoger los paquetes que necesita y llevarlos a
 * sus clientes; lo que nadie recoge se traslada con la unidad averiada al almacén central (averías
 * 2 y 3). El tiempo de trasvase es {@link ConfiguracionOperacion#tiempoTrasvaseHoras()}.
 *
 * <p>Se ejecuta en cada lote ANTES del planificador (ALNS o IPSO): los pedidos que se rescatan aquí
 * ya no se le ofrecen al planificador, y la unidad rescatadora queda ocupada. Los pedidos que no se
 * pueden rescatar a tiempo sí van al planificador, que los atiende con stock de un almacén; en ese
 * caso su carga a bordo de la averiada pasa a ser sobrante y vuelve al central con ella.
 *
 * <p>Heurística: por cada unidad averiada con carga, en orden de urgencia de sus pedidos, se elige
 * la unidad disponible que rescata más pedidos a tiempo (desempate: la que llega antes al punto).
 */
final class PlanificadorTrasvase {

    private PlanificadorTrasvase() {
    }

    /** Un rescate posible: qué unidad, cuándo llega al punto y qué paradas entrega a tiempo. */
    private record Propuesta(UnidadTransporte rescatadora, LocalDateTime llegadaPunto, List<ParadaPlanificada> paradas,
            double kmTotales) {
    }

    /** Reloj de una unidad durante la estimación: instante actual y si ya tomó el refrigerio. */
    private static final class Reloj {
        LocalDateTime t;
        boolean refrigerioTomado;
        final LocalDateTime refrigerioMasTardio;

        Reloj(LocalDateTime t, boolean refrigerioTomado, LocalDateTime refrigerioMasTardio) {
            this.t = t;
            this.refrigerioTomado = refrigerioTomado;
            this.refrigerioMasTardio = refrigerioMasTardio;
        }
    }

    static List<Ruta> planificar(List<UnidadTransporte> flota, ContextoProblemaVista ctx) {
        List<Ruta> rescates = new ArrayList<>();
        for (UnidadTransporte averiada : flota) {
            if (!puedeEntregarCarga(averiada, ctx.ahora())) {
                continue;
            }
            List<ParadaPlanificada> pendientes = new ArrayList<>(averiada.getCargaVarada().stream()
                    .filter(p -> p.getPedido().getEstado() == EstadoPedido.PENDIENTE)
                    .sorted(Comparator.comparing(p -> p.getPedido().getFechaLimite()))
                    .toList());
            while (!pendientes.isEmpty()) {
                Propuesta mejor = null;
                for (UnidadTransporte candidata : flota) {
                    if (candidata == averiada || !candidata.estaDisponibleParaRuta(ctx.ahora())) {
                        continue;
                    }
                    Propuesta p = evaluar(candidata, averiada.getPosicion(), pendientes, ctx);
                    if (p != null && (mejor == null || p.paradas().size() > mejor.paradas().size()
                            || (p.paradas().size() == mejor.paradas().size()
                                    && p.llegadaPunto().isBefore(mejor.llegadaPunto())))) {
                        mejor = p;
                    }
                }
                if (mejor == null) {
                    break; // lo que queda lo intenta el planificador con stock de un almacén
                }
                rescates.add(crearRuta(mejor, averiada, ctx));
                for (ParadaPlanificada p : mejor.paradas()) {
                    averiada.quitarCargaVarada(p.getPedido());
                    pendientes.removeIf(x -> x.getPedido().equals(p.getPedido()));
                }
            }
        }
        return rescates;
    }

    /** Solo se rescata de una unidad averiada que sigue en el sitio (aún no trasladada al central). */
    private static boolean puedeEntregarCarga(UnidadTransporte unidad, LocalDateTime ahora) {
        if (unidad.getEstado() != EstadoUnidad.AVERIADO || unidad.getAveriaActual() == null
                || unidad.getCargaVarada().isEmpty()) {
            return false;
        }
        LocalDateTime traslado = unidad.getAveriaActual().fechaTrasladoAlmacen();
        return traslado == null || ahora.isBefore(traslado);
    }

    private static Propuesta evaluar(UnidadTransporte candidata, Nodo punto, List<ParadaPlanificada> pendientes,
            ContextoProblemaVista ctx) {
        ConfiguracionOperacion op = ctx.operacion();
        Reloj reloj = relojInicial(candidata, ctx);
        LocalDateTime inicioMantenimiento = proximoMantenimiento(candidata, ctx);

        double km;
        try {
            km = CalculadorDistancia.distanciaKm(ctx.ciudad(), ctx.bloqueos(), reloj.t, candidata.getPosicion(), punto);
        } catch (IllegalStateException sinCamino) {
            return null;
        }
        avanzar(reloj, km, candidata.getTipoVehiculo().getVelocidadKmH(), op);
        LocalDateTime llegadaPunto = reloj.t;
        reloj.t = reloj.t.plusSeconds(Math.round(op.tiempoTrasvaseHoras() * 3600.0));

        int capacidad = candidata.getTipoVehiculo().getCapacidad();
        int carga = 0;
        double kmTotales = km;
        Nodo posicion = punto;
        List<ParadaPlanificada> elegidas = new ArrayList<>();
        for (ParadaPlanificada item : pendientes) {
            if (elegidas.size() >= op.maxParadasPorRuta() || carga + item.getCantidadAEntregar() > capacidad) {
                continue;
            }
            Reloj prueba = new Reloj(reloj.t, reloj.refrigerioTomado, reloj.refrigerioMasTardio);
            double kmTramo;
            try {
                kmTramo = CalculadorDistancia.distanciaKm(ctx.ciudad(), ctx.bloqueos(), prueba.t, posicion,
                        item.getPedido().getDestino());
            } catch (IllegalStateException sinCamino) {
                continue;
            }
            avanzar(prueba, kmTramo, candidata.getTipoVehiculo().getVelocidadKmH(), op);
            if (prueba.t.isAfter(item.getPedido().getFechaLimite())) {
                continue;
            }
            LocalDateTime finServicio = prueba.t.plusSeconds(Math.round(op.tiempoServicioClienteHoras() * 3600.0));
            if (inicioMantenimiento != null && finServicio.isAfter(inicioMantenimiento)) {
                continue;
            }
            ParadaPlanificada parada = new ParadaPlanificada(item.getPedido(), item.getCantidadAEntregar());
            parada.setFechaEntregada(prueba.t);
            elegidas.add(parada);
            carga += item.getCantidadAEntregar();
            kmTotales += kmTramo;
            posicion = item.getPedido().getDestino();
            reloj.t = finServicio;
            reloj.refrigerioTomado = prueba.refrigerioTomado;
        }
        return elegidas.isEmpty() ? null : new Propuesta(candidata, llegadaPunto, elegidas, kmTotales);
    }

    /** Mismo criterio de refrigerio que MotorSimulacion: a más tardar en su último inicio permitido. */
    private static void avanzar(Reloj reloj, double km, double velocidadKmH, ConfiguracionOperacion op) {
        long refrigerioSeg = Math.round(op.duracionRefrigerioHoras() * 3600.0);
        if (!reloj.refrigerioTomado && !reloj.t.isBefore(reloj.refrigerioMasTardio)) {
            reloj.t = reloj.t.plusSeconds(refrigerioSeg);
            reloj.refrigerioTomado = true;
        }
        LocalDateTime llegada = reloj.t.plusSeconds(Math.round(km / velocidadKmH * 3600.0));
        if (!reloj.refrigerioTomado && llegada.isAfter(reloj.refrigerioMasTardio)) {
            llegada = llegada.plusSeconds(refrigerioSeg);
            reloj.refrigerioTomado = true;
        }
        reloj.t = llegada;
    }

    private static Reloj relojInicial(UnidadTransporte unidad, ContextoProblemaVista ctx) {
        ConfiguracionOperacion op = ctx.operacion();
        LocalDateTime turno = op.inicioTurnoQueContiene(ctx.ahora());
        boolean tomado = turno.equals(unidad.getTiempoInicioTurnoActual()) && unidad.isRefrigerioTomado();
        LocalDateTime t = ctx.ahora();
        if (unidad.getHoraRefrigerioProgramada() != null) {
            LocalDateTime fin = unidad.getHoraRefrigerioProgramada()
                    .plusSeconds(Math.round(op.duracionRefrigerioHoras() * 3600.0));
            if (fin.isAfter(t)) {
                t = fin;
            }
            tomado = true;
        }
        return new Reloj(t, tomado, op.inicioRefrigerioMasTardio(turno));
    }

    private static LocalDateTime proximoMantenimiento(UnidadTransporte unidad, ContextoProblemaVista ctx) {
        return ctx.mantenimientos().stream()
                .filter(m -> m.vehiculoAfectado() == unidad)
                .map(Mantenimiento::fechaInicio)
                .filter(inicio -> inicio.isAfter(ctx.ahora()))
                .min(LocalDateTime::compareTo)
                .orElse(null);
    }

    private static Ruta crearRuta(Propuesta propuesta, UnidadTransporte averiada, ContextoProblemaVista ctx) {
        UnidadTransporte rescatadora = propuesta.rescatadora();
        Ruta ruta = new Ruta(Ruta.generarId(rescatadora.getIdUnidad(), ctx.ahora(), "trasvase-" + averiada.getIdUnidad()),
                ctx.ahora(), rescatadora);
        ruta.programarTrasvase(averiada, averiada.getPosicion());
        ruta.getSecuenciaParadas().addAll(propuesta.paradas());
        ruta.setEstado(EstadoRuta.PLANIFICADA);
        ruta.setCostoEstimado(propuesta.kmTotales() * rescatadora.getTipoVehiculo().getCostoPorKm());
        LocalDateTime ultima = propuesta.paradas().get(propuesta.paradas().size() - 1).getFechaEntregada();
        ruta.setDuracionEstimada(java.time.Duration.between(ctx.ahora(), ultima).toSeconds() / 3600.0
                + ctx.operacion().tiempoServicioClienteHoras());
        // Ocupada desde ya: así el planificador de este mismo lote no le asigna otra ruta.
        rescatadora.setEstado(EstadoUnidad.EN_RUTA);
        return ruta;
    }

    /** Lo que el trasvase necesita saber del lote, sin depender del ContextoProblema completo. */
    record ContextoProblemaVista(LocalDateTime ahora, com.paqrap.dominio.Ciudad ciudad, List<Bloqueo> bloqueos,
            List<Mantenimiento> mantenimientos, ConfiguracionOperacion operacion) {
    }
}
