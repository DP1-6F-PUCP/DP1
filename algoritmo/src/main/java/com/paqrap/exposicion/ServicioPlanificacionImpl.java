package com.paqrap.exposicion;

import com.paqrap.PlanificadorFactory;
import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.GestorLogSimulacion;
import com.paqrap.simulador.OrquestadorOperacion;
import com.paqrap.simulador.SolicitudOperacion;
import com.paqrap.simulador.TipoEscenario;
import com.paqrap.simulador.TipoSolicitud;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Implementación de referencia de {@link ServicioPlanificacion}, respaldada por un
 * {@link OrquestadorOperacion} por ejecución de escenario.
 *
 * <p>Punto de integración natural para un futuro {@code @RestController} de Spring Boot (ver
 * {@code 61.std.java}): esta clase no depende de Spring, así que el controlador solo necesitaría
 * inyectarla y traducir HTTP &lt;-&gt; sus métodos.
 */
public class ServicioPlanificacionImpl implements ServicioPlanificacion {

    private final Ciudad ciudad;
    private final ConfiguracionOperacion configuracionOperacion;
    private final List<TipoVehiculo> tiposVehiculo;
    private final List<Almacen> almacenes;
    private final List<UnidadTransporte> flota;
    private final TipoAlgoritmo algoritmoPorDefecto;
    private final Map<String, Object> configAlgoritmo;
    private final String carpetaLogs;

    private final List<Pedido> pedidosRecibidos = new CopyOnWriteArrayList<>();
    private final List<Bloqueo> bloqueosRecibidos = new CopyOnWriteArrayList<>();
    private final List<Mantenimiento> mantenimientosRecibidos = new CopyOnWriteArrayList<>();
    private final Map<String, OrquestadorOperacion> ejecuciones = new ConcurrentHashMap<>();
    private volatile String idEjecucionActiva;

    public ServicioPlanificacionImpl(Ciudad ciudad, ConfiguracionOperacion configuracionOperacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota,
            TipoAlgoritmo algoritmoPorDefecto, Map<String, Object> configAlgoritmo, String carpetaLogs) {
        this.ciudad = ciudad;
        this.configuracionOperacion = configuracionOperacion;
        this.tiposVehiculo = tiposVehiculo;
        this.almacenes = almacenes;
        this.flota = flota;
        this.algoritmoPorDefecto = algoritmoPorDefecto;
        this.configAlgoritmo = configAlgoritmo;
        this.carpetaLogs = carpetaLogs;
    }

    @Override
    public void recibirArchivo(ArchivoEntrada archivo) {
        TipoArchivo tipo = inferirTipoArchivo(archivo.nombreArchivo());
        YearMonth periodo = inferirPeriodo(archivo.nombreArchivo()).orElse(YearMonth.now());

        CargaArchivo carga = new CargaArchivo(archivo.nombreArchivo(), tipo, periodo);
        carga.procesarArchivo(archivo.contenido());

        if (!carga.getErrores().isEmpty()) {
            throw new IllegalArgumentException("El archivo " + archivo.nombreArchivo() + " tiene "
                    + carga.getErrores().size() + " línea(s) inválida(s): " + carga.getErrores().get(0).tipoError());
        }

        pedidosRecibidos.addAll(carga.getPedidos());
        bloqueosRecibidos.addAll(carga.getBloqueos());
        for (var pendiente : carga.getMantenimientosPendientes()) {
            flota.stream()
                    .filter(u -> u.getIdUnidad().equalsIgnoreCase(pendiente.idUnidad()))
                    .findFirst()
                    .ifPresent(unidad -> {
                        LocalDateTime inicio = pendiente.fecha().atStartOfDay();
                        LocalDateTime fin = inicio.plusHours((long) unidad.getTipoVehiculo().getDuracionMantenimientoHoras());
                        mantenimientosRecibidos.add(new Mantenimiento(unidad, inicio, fin));
                    });
        }
    }

    @Override
    public List<RutaDTO> consultarRutasVigentes() {
        OrquestadorOperacion orquestador = ejecucionActivaOrquestador();
        if (orquestador == null) {
            return List.of();
        }
        return orquestador.getUltimasRutas().stream().map(EnsambladorRespuestas::aRutaDTO).toList();
    }

    @Override
    public EstadoOperacionDTO consultarEstadoOperacion() {
        OrquestadorOperacion orquestador = ejecucionActivaOrquestador();
        if (orquestador == null) {
            ContextoProblema contextoVacio = new ContextoProblema(LocalDateTime.now(), List.of(), List.of(),
                    List.of(), almacenes, flota, ciudad, configuracionOperacion);
            return EnsambladorRespuestas.ensamblarEstado(contextoVacio, List.of(), List.of(), LocalDateTime.now(),
                    new com.paqrap.simulador.ReporteDesempeno());
        }
        return EnsambladorRespuestas.ensamblarEstado(orquestador.getContextoProblema(), orquestador.getUltimasRutas(),
                orquestador.getUltimosEventos(), orquestador.getAnclaUltimoLote(), orquestador.getReporte());
    }

    @Override
    public ConfiguracionActualDTO consultarConfiguracionActual() {
        return new ConfiguracionActualDTO(
                EnsambladorRespuestas.aCiudadDTO(ciudad),
                EnsambladorRespuestas.aConfiguracionOperacionDTO(configuracionOperacion),
                tiposVehiculo.stream().map(EnsambladorRespuestas::aTipoVehiculoDTO).toList(),
                almacenes.stream().map(EnsambladorRespuestas::aAlmacenDTO).toList());
    }

    @Override
    public List<PedidoDTO> consultarPedidos(FiltroPedidos filtro) {
        List<Pedido> fuente = pedidosActuales();
        String estadoFiltro = filtro != null ? filtro.estado() : null;
        return fuente.stream()
                .filter(p -> estadoFiltro == null || p.getEstado().name().equalsIgnoreCase(estadoFiltro))
                .map(EnsambladorRespuestas::aPedidoDTO)
                .toList();
    }

    @Override
    public EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada) {
        ParametrosOrquestacion defaults = defaultsPara(tipo);
        return seleccionarEscenario(tipo, fechaInicioSimulada, defaults.sa(), defaults.ta(), defaults.k(),
                defaults.tiempoMaximoComputoSegundos());
    }

    @Override
    public EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada, float sa,
            float ta, float k, float tiempoMaximoComputoSegundos) {
        List<Pedido> pedidosPendientes = pedidosRecibidos.stream()
                .filter(p -> p.getEstado() == EstadoPedido.PENDIENTE)
                .toList();

        ContextoProblema contextoInicial = new ContextoProblema(fechaInicioSimulada, pedidosPendientes,
                List.copyOf(bloqueosRecibidos), List.copyOf(mantenimientosRecibidos), almacenes, flota, ciudad,
                configuracionOperacion);

        var planificador = PlanificadorFactory.crear(algoritmoPorDefecto, configAlgoritmo);
        var gestorLog = new GestorLogSimulacion(carpetaLogs, false);
        OrquestadorOperacion orquestador = new OrquestadorOperacion(planificador, gestorLog, sa, ta, k,
                tiempoMaximoComputoSegundos, contextoInicial);

        EjecucionEscenario ejecucion = orquestador.iniciarCicloPeriodico(tipo);
        ejecuciones.put(ejecucion.getIdEjecucion(), orquestador);
        idEjecucionActiva = ejecucion.getIdEjecucion();
        return ejecucion;
    }

    @Override
    public void programarSolicitud(EjecucionEscenario ejecucion, LocalDateTime tiempoSimulado,
            TipoSolicitud tipoSolicitud, String entidadObjetivo, String valorNuevo) {
        OrquestadorOperacion orquestador = ejecuciones.get(ejecucion.getIdEjecucion());
        if (orquestador == null) {
            throw new IllegalArgumentException("No hay una ejecución activa con id " + ejecucion.getIdEjecucion());
        }
        orquestador.encolarSolicitud(new SolicitudOperacion(tiempoSimulado, tipoSolicitud, entidadObjetivo, valorNuevo));
    }

    private OrquestadorOperacion ejecucionActivaOrquestador() {
        return idEjecucionActiva != null ? ejecuciones.get(idEjecucionActiva) : null;
    }

    private List<Pedido> pedidosActuales() {
        OrquestadorOperacion orquestador = ejecucionActivaOrquestador();
        if (orquestador != null) {
            return orquestador.getContextoProblema().pedidos();
        }
        return new ArrayList<>(pedidosRecibidos);
    }

    private TipoArchivo inferirTipoArchivo(String nombreArchivo) {
        String nombre = nombreArchivo.toLowerCase();
        if (nombre.startsWith("ventas")) {
            return TipoArchivo.PEDIDOS;
        }
        if (nombre.startsWith("bloqueo")) {
            return TipoArchivo.BLOQUEOS;
        }
        if (nombre.startsWith("mant.preventivo") || nombre.startsWith("mant")) {
            return TipoArchivo.MANTENIMIENTO;
        }
        throw new IllegalArgumentException("No se pudo inferir el tipo de archivo a partir del nombre: " + nombreArchivo);
    }

    private java.util.Optional<YearMonth> inferirPeriodo(String nombreArchivo) {
        try {
            if (nombreArchivo.startsWith("ventas.")) {
                String digitos = nombreArchivo.replaceAll("[^0-9]", "");
                return java.util.Optional.of(YearMonth.of(Integer.parseInt(digitos.substring(0, 4)),
                        Integer.parseInt(digitos.substring(4, 6))));
            }
            if (nombreArchivo.startsWith("bloqueo.")) {
                String digitos = nombreArchivo.replaceAll("[^0-9]", "");
                int anio = 2000 + Integer.parseInt(digitos.substring(0, 2));
                int mes = Integer.parseInt(digitos.substring(2, 4));
                return java.util.Optional.of(YearMonth.of(anio, mes));
            }
        } catch (DateTimeParseException | NumberFormatException | IndexOutOfBoundsException ex) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.empty();
    }

    /** Valores de referencia de {@code sa}/{@code ta}/{@code k} para cuando el llamador no calibra explícitamente. */
    private record ParametrosOrquestacion(float sa, float ta, float k, float tiempoMaximoComputoSegundos) {
    }

    /**
     * Valores por defecto de la dinámica de planificación programada, según lo indicado
     * directamente por el profesor: Ta=1 minuto (tiempo de ejecución de la planificación),
     * Sa=5 minutos (salto entre lanzamientos), K=1 para día a día. Para {@code CINCO_DIAS} y
     * {@code COLAPSO_LOGISTICO} se usan los valores ilustrativos que dio como ejemplo (K=14 y
     * K=75 respectivamente) — el propio profesor aclaró que, salvo K=1, estos valores deben
     * obtenerse por calibración real; por eso {@link #seleccionarEscenario(TipoEscenario,
     * LocalDateTime, float, float, float, float)} permite sobreescribirlos explícitamente.
     */
    private ParametrosOrquestacion defaultsPara(TipoEscenario tipo) {
        float ta = 1f;
        float sa = 5f;
        float tiempoMaximoComputoSegundos = ta * 60f;
        float k = switch (tipo) {
            case DIA_A_DIA -> 1f;
            case CINCO_DIAS -> 14f;
            case COLAPSO_LOGISTICO -> 75f;
        };
        return new ParametrosOrquestacion(sa, ta, k, tiempoMaximoComputoSegundos);
    }
}
