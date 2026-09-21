package com.paqrap.exposicion;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.simulador.EventoSimulacion;
import com.paqrap.simulador.ReporteDesempeno;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Traduce las entidades del dominio interno (nunca serializadas directamente, per 65.std.api) a
 * los DTO de la capa de Exposición.
 */
public final class EnsambladorRespuestas {

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
                rutas.stream().map(EnsambladorRespuestas::aRutaDTO).toList(),
                contexto.vehiculos().stream().map(EnsambladorRespuestas::aVehiculoDTO).toList(),
                contexto.almacenes().stream().map(EnsambladorRespuestas::aAlmacenDTO).toList(),
                contexto.bloqueos().stream().map(b -> aBloqueoDTO(b, contexto.marcaTiempoActual())).toList(),
                eventosRecientes.stream().map(evento -> aEventoDTO(evento, anclaEventos)).toList(),
                aMetricasDTO(reporte));
    }

    public static PedidoDTO aPedidoDTO(Pedido pedido) {
        return new PedidoDTO(pedido.getIdPedido(), pedido.getIdCliente(), pedido.getEstado().name(),
                pedido.getDestino().x(), pedido.getDestino().y(), pedido.getCantidadSolicitada(),
                pedido.cantidadEntregadaTotal(), pedido.getFechaLimite());
    }

    public static RutaDTO aRutaDTO(Ruta ruta) {
        List<String> secuencia = ruta.getSecuenciaParadas().stream()
                .map(ParadaPlanificada::getPedido)
                .map(Pedido::getIdPedido)
                .toList();
        return new RutaDTO(ruta.getIdRuta(), ruta.getUnidadTransporte().getIdUnidad(),
                ruta.getUnidadTransporte().getTipoVehiculo().getId(), ruta.getEstado().name(), secuencia);
    }

    public static VehiculoDTO aVehiculoDTO(UnidadTransporte unidad) {
        int cargaActual = unidad.cargaActual();
        return new VehiculoDTO(unidad.getIdUnidad(), unidad.getTipoVehiculo().getId(), unidad.getEstado().name(),
                unidad.getPosicion().x(), unidad.getPosicion().y(), cargaActual);
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
        List<String> nodos = bloqueo.getSecuenciaNodos().stream().map(Object::toString).toList();
        return new BloqueoDTO(nodos, bloqueo.getFechaInicio(), bloqueo.getFechaFin(),
                bloqueo.estaVigente(instanteActual));
    }

    public static EventoDTO aEventoDTO(EventoSimulacion evento, LocalDateTime ancla) {
        LocalDateTime instante = ancla.plusSeconds(Math.round(evento.getTiempoHoras() * 3600.0));
        return new EventoDTO(instante, evento.getTipo().name(), evento.getVehiculoId(), evento.getX(), evento.getY());
    }

    public static CiudadDTO aCiudadDTO(Ciudad ciudad) {
        return new CiudadDTO(ciudad.ancho(), ciudad.alto(), ciudad.distanciaEntreNodos(), ciudad.callesDobleSentido(),
                ciudad.origen().x(), ciudad.origen().y());
    }

    public static ConfiguracionOperacionDTO aConfiguracionOperacionDTO(ConfiguracionOperacion operacion) {
        return new ConfiguracionOperacionDTO((float) operacion.duracionTurnoHoras(), (float) operacion.horaInicioTurno(),
                (float) operacion.tiempoServicioClienteHoras(), (float) operacion.duracionRefrigerioHoras(),
                (float) operacion.tiempoTrasvaseHoras(), (float) operacion.margenRefrigerioHoras(),
                (float) operacion.tiempoCargaAlmacenHoras());
    }

    public static TipoVehiculoDTO aTipoVehiculoDTO(TipoVehiculo tipoVehiculo) {
        return new TipoVehiculoDTO(tipoVehiculo.getId(), tipoVehiculo.getNombre(), tipoVehiculo.getCapacidad(),
                (float) tipoVehiculo.getVelocidadKmH(), (float) tipoVehiculo.getCostoPorKm());
    }

    public static MetricasOperacionDTO aMetricasDTO(ReporteDesempeno reporte) {
        return new MetricasOperacionDTO(reporte.getCostoTotalAcumulado(), reporte.porcentajeEntregasATiempo(),
                reporte.getContadorParadasReasignadas(), reporte.getContadorAverias(),
                reporte.getContadorInterferenciasBloqueo());
    }
}
