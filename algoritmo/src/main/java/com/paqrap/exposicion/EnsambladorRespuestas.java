package com.paqrap.exposicion;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoParada;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.simulador.EventoSimulacion;
import com.paqrap.simulador.ReporteDesempeno;
import com.paqrap.simulador.TipoEvento;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Traduce las entidades del dominio interno (nunca serializadas directamente, per 65.std.api) a
 * los DTO de la capa de Exposición.
 */
public final class EnsambladorRespuestas {

    private static final Logger log = LoggerFactory.getLogger(EnsambladorRespuestas.class);

    private EnsambladorRespuestas() {
    }

    /**
     * Ensambla la instantánea completa de estado operativo para el visualizador.
     *
     * @param contexto estado actual del problema
     * @param rutas rutas vigentes
     * @param eventosRecientes últimos eventos de simulación a incluir
     * @param anclaEventos instante simulado desde el cual {@code eventosRecientes} mide sus horas
     *         relativas (el inicio del ciclo que los generó, no {@code contexto.marcaTiempoActual()},
     *         que ya avanzó más allá de ese ciclo)
     * @param reporte métricas acumuladas de la ejecución en curso
     * @return la instantánea lista para exponer
     */
    public static EstadoOperacionDTO ensamblarEstado(ContextoProblema contexto, List<Ruta> rutas,
            List<EventoSimulacion> eventosRecientes, LocalDateTime anclaEventos, ReporteDesempeno reporte) {
        return new EstadoOperacionDTO(
                contexto.marcaTiempoActual(),
                rutas.stream()
                        .map(r -> aRutaDTO(r, contexto.ciudad(), contexto.bloqueos(), contexto.marcaTiempoActual()))
                        .toList(),
                contexto.vehiculos().stream()
                        .map(v -> aVehiculoDTO(v, contexto.ciudad(), contexto.bloqueos(), contexto.almacenes(),
                                contexto.marcaTiempoActual()))
                        .toList(),
                contexto.almacenes().stream().map(EnsambladorRespuestas::aAlmacenDTO).toList(),
                contexto.bloqueos().stream().map(b -> aBloqueoDTO(b, contexto.marcaTiempoActual())).toList(),
                eventosRecientes.stream().map(evento -> aEventoDTO(evento, anclaEventos)).toList(),
                aMetricasDTO(reporte));
    }

    public static PedidoDTO aPedidoDTO(Pedido pedido) {
        return new PedidoDTO(pedido.getIdPedido(), pedido.getIdCliente(), pedido.getEstado().name(),
                pedido.getDestino().x(), pedido.getDestino().y(), pedido.getCantidadSolicitada(),
                pedido.cantidadEntregadaTotal(), pedido.getFechaIngreso(), pedido.getHorasLimite(),
                pedido.getFechaLimite());
    }

    public static RutaDTO aRutaDTO(Ruta ruta, Ciudad ciudad, List<Bloqueo> bloqueos, LocalDateTime instante) {
        List<String> secuencia = ruta.getSecuenciaParadas().stream()
                .map(ParadaPlanificada::getPedido)
                .map(Pedido::getIdPedido)
                .toList();
        List<String> geometria = calcularGeometriaRuta(ruta, ciudad, bloqueos, instante);
        return new RutaDTO(ruta.getIdRuta(), ruta.getUnidadTransporte().getIdUnidad(),
                ruta.getUnidadTransporte().getTipoVehiculo().getId(), ruta.getEstado().name(), secuencia,
                ruta.getCostoEstimado(), ruta.getDuracionEstimada(), geometria);
    }

    /**
     * Camino real nodo a nodo desde la posición actual de la unidad hasta la última parada,
     * pasando por cada parada intermedia en orden, vía {@link CalculadorDistancia} -- el mismo
     * cálculo que ya usa el propio planificador, no una aproximación paralela. Si algún tramo
     * queda sin camino transitable (bloqueo total), se corta ahí: es geometría de visualización,
     * no una garantía operativa, así que un bloqueo irresoluble no debe tumbar todo
     * {@code GET /api/estado-operacion}.
     */
    private static List<String> calcularGeometriaRuta(Ruta ruta, Ciudad ciudad, List<Bloqueo> bloqueos,
            LocalDateTime instante) {
        List<Nodo> geometria = new ArrayList<>();
        Nodo actual = ruta.getUnidadTransporte().getPosicion();
        geometria.add(actual);
        // Bug real corregido (reporte directo: el vehiculo parecia "retroceder" en el front justo
        // despues de completar una entrega): getSecuenciaParadas() devuelve TODAS las paradas de la
        // ruta, incluidas las ya CUMPLIDAs en un lote anterior -- sin este filtro, el primer tramo de
        // cada recalculo iba desde la posicion ACTUAL del vehiculo (ya avanzada) de vuelta hacia la
        // parada que acaba de cumplir (que queda detras), antes de recien continuar hacia la
        // siguiente parada pendiente. Esa geometria "ida y vuelta" es la que anima
        // LeafletManhattanMap (ver posicionExtrapolada), asi que el viaje de regreso se veia como la
        // ruta retrocediendo. Solo las paradas aun no cumplidas representan el camino que falta.
        for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
            if (parada.getEstado() == EstadoParada.CUMPLIDA) {
                continue;
            }
            Nodo destino = parada.getPedido().getDestino();
            try {
                List<Nodo> tramo = CalculadorDistancia.caminoMasCorto(ciudad, bloqueos, instante, actual, destino);
                geometria.addAll(tramo.subList(1, tramo.size()));
            } catch (IllegalStateException sinCamino) {
                log.warn("Sin camino transitable entre {} y {} para la ruta {}; geometría truncada", actual, destino,
                        ruta.getIdRuta());
                break;
            }
            actual = destino;
        }
        return geometria.stream().map(n -> n.x() + "," + n.y()).toList();
    }

    public static VehiculoDTO aVehiculoDTO(UnidadTransporte unidad, Ciudad ciudad, List<Bloqueo> bloqueos,
            List<Almacen> almacenes, LocalDateTime instante) {
        int cargaActual = unidad.cargaActual();
        List<String> geometriaRetorno = calcularGeometriaRetorno(unidad, ciudad, bloqueos, almacenes, instante);
        return new VehiculoDTO(unidad.getIdUnidad(), unidad.getTipoVehiculo().getId(), unidad.getEstado().name(),
                unidad.getPosicion().x(), unidad.getPosicion().y(), cargaActual, geometriaRetorno);
    }

    /**
     * Camino real hacia el almacén más cercano para una unidad que ya terminó sus entregas pero
     * aún no llegó de vuelta -- ver el porqué en el Javadoc de {@link VehiculoDTO#geometriaRetorno}.
     * Mismo criterio de selección de almacén que {@code MotorSimulacion.simularRetornoAlmacen}
     * ({@link Almacen#masCercano}), así que el camino mostrado coincide con el que la simulación
     * real está recorriendo, no una aproximación distinta.
     */
    private static List<String> calcularGeometriaRetorno(UnidadTransporte unidad, Ciudad ciudad,
            List<Bloqueo> bloqueos, List<Almacen> almacenes, LocalDateTime instante) {
        if (unidad.getEstado() != EstadoUnidad.DISPONIBLE || unidad.rutaEnEjecucion() != null) {
            return List.of();
        }
        Nodo posicionActual = unidad.getPosicion();
        Almacen destino = Almacen.masCercanoConStock(almacenes, posicionActual);
        if (destino == null || posicionActual.equals(destino.getPosicion())) {
            return List.of();
        }
        try {
            List<Nodo> camino = CalculadorDistancia.caminoMasCorto(ciudad, bloqueos, instante, posicionActual,
                    destino.getPosicion());
            return camino.stream().map(n -> n.x() + "," + n.y()).toList();
        } catch (IllegalStateException sinCamino) {
            return List.of();
        }
    }

    public static AlmacenDTO aAlmacenDTO(Almacen almacen) {
        boolean esCentral = almacen instanceof AlmacenCentral;
        String nombre = almacen instanceof AlmacenIntermedio intermedio ? intermedio.getNombre() : "Central";
        int stockActual = almacen instanceof AlmacenIntermedio intermedio ? intermedio.getStockActual() : 0;
        int capacidadMaxima = almacen instanceof AlmacenIntermedio intermedio ? intermedio.getCapacidadMaxima() : 0;
        float nivelOcupacion = capacidadMaxima > 0 ? (100f * stockActual / capacidadMaxima) : 0f;
        return new AlmacenDTO(nombre, esCentral, almacen.getPosicion().x(), almacen.getPosicion().y(), stockActual,
                capacidadMaxima, nivelOcupacion);
    }

    public static BloqueoDTO aBloqueoDTO(Bloqueo bloqueo, LocalDateTime instanteActual) {
        // Bug real corregido: Object::toString usaba Nodo.toString() ("(x, y)", con paréntesis y
        // espacio), pero el frontend parsea cada nodo con "x,y".split(","); con el formato viejo
        // ambas mitades fallaban Number(...) y cada bloqueo se dibujaba colapsado en (0,0).
        List<String> nodos = bloqueo.getSecuenciaNodos().stream().map(n -> n.x() + "," + n.y()).toList();
        return new BloqueoDTO(nodos, bloqueo.getFechaInicio(), bloqueo.getFechaFin(),
                bloqueo.estaVigente(instanteActual));
    }

    public static EventoDTO aEventoDTO(EventoSimulacion evento, LocalDateTime ancla) {
        LocalDateTime instante = ancla.plusSeconds(Math.round(evento.getTiempoHoras() * 3600.0));
        return new EventoDTO(instante, evento.getTipo().name(), evento.getVehiculoId(), evento.getX(), evento.getY(),
                evento.getPedidoId(), evento.getDescripcion());
    }

    /**
     * Genera una alerta ({@link EventoDTO} sintético, tipo {@code PEDIDO_EN_RIESGO_SLA}) por cada
     * pedido pendiente cuyo plazo vence dentro de {@code horasUmbral} horas desde
     * {@code instanteActual}. No es un evento registrado por {@link com.paqrap.simulador.MotorSimulacion}
     * (no ocurrió nada, es una condición continua) — se recalcula bajo demanda, típicamente una vez
     * por lote de planificación, para alimentar {@code GET /api/alerts} y el campo {@code newAlerts}
     * del WebSocket.
     */
    public static List<EventoDTO> alertasRiesgoSLA(List<Pedido> pedidos, LocalDateTime instanteActual,
            double horasUmbral) {
        return pedidos.stream()
                .filter(p -> p.getEstado() == com.paqrap.dominio.EstadoPedido.PENDIENTE)
                .filter(p -> {
                    double horasRestantes = java.time.Duration.between(instanteActual, p.getFechaLimite()).toMinutes() / 60.0;
                    return horasRestantes >= 0 && horasRestantes <= horasUmbral;
                })
                .map(p -> {
                    long minutosRestantes = java.time.Duration.between(instanteActual, p.getFechaLimite()).toMinutes();
                    String descripcion = String.format("Pedido %s a %d min de vencer su plazo", p.getIdPedido(),
                            minutosRestantes);
                    return new EventoDTO(instanteActual, TipoEvento.PEDIDO_EN_RIESGO_SLA.name(), null,
                            p.getDestino().x(), p.getDestino().y(), p.getIdPedido(), descripcion);
                })
                .toList();
    }

    /** Variante de {@link #alertasRiesgoSLA(List, LocalDateTime, double)} sobre {@link PedidoDTO},
     * para usarse desde un controlador que solo tiene acceso a la capa de Exposición. */
    public static List<EventoDTO> alertasRiesgoSLADesdeDTO(List<PedidoDTO> pedidos, LocalDateTime instanteActual,
            double horasUmbral) {
        return pedidos.stream()
                .filter(p -> "PENDIENTE".equals(p.estado()))
                .filter(p -> {
                    double horasRestantes = java.time.Duration.between(instanteActual, p.fechaLimite()).toMinutes() / 60.0;
                    return horasRestantes >= 0 && horasRestantes <= horasUmbral;
                })
                .map(p -> {
                    long minutosRestantes = java.time.Duration.between(instanteActual, p.fechaLimite()).toMinutes();
                    String descripcion = String.format("Pedido %s a %d min de vencer su plazo", p.idPedido(),
                            minutosRestantes);
                    return new EventoDTO(instanteActual, TipoEvento.PEDIDO_EN_RIESGO_SLA.name(), null, p.posX(),
                            p.posY(), p.idPedido(), descripcion);
                })
                .toList();
    }

    public static CiudadDTO aCiudadDTO(Ciudad ciudad) {
        return new CiudadDTO(ciudad.ancho(), ciudad.alto(), ciudad.distanciaEntreNodos(), ciudad.callesDobleSentido(),
                ciudad.origen().x(), ciudad.origen().y());
    }

    public static ConfiguracionOperacionDTO aConfiguracionOperacionDTO(ConfiguracionOperacion operacion) {
        return new ConfiguracionOperacionDTO((float) operacion.duracionTurnoHoras(), (float) operacion.horaInicioTurno(),
                (float) operacion.tiempoServicioClienteHoras(), (float) operacion.duracionRefrigerioHoras(),
                (float) operacion.tiempoTrasvaseHoras(), (float) operacion.margenRefrigerioHoras(),
                (float) operacion.tiempoCargaAlmacenHoras(), operacion.maxParadasPorRuta());
    }

    public static TipoVehiculoDTO aTipoVehiculoDTO(TipoVehiculo tipoVehiculo) {
        return new TipoVehiculoDTO(tipoVehiculo.getId(), tipoVehiculo.getNombre(), tipoVehiculo.getCapacidad(),
                (float) tipoVehiculo.getVelocidadKmH(), (float) tipoVehiculo.getCostoPorKm());
    }

    public static MetricasOperacionDTO aMetricasDTO(ReporteDesempeno reporte) {
        return new MetricasOperacionDTO(reporte.getCostoTotalAcumulado(), reporte.porcentajeEntregasATiempo(),
                reporte.getContadorEntregados(), reporte.getContadorIncumplidos(),
                reporte.getContadorParadasReasignadas(), reporte.getContadorAverias(),
                reporte.getContadorInterferenciasBloqueo());
    }
}
