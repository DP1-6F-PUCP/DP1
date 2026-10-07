package com.paqrap.exposicion;

import com.paqrap.PlanificadorFactory;
import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Averia;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.dominio.TipoAveria;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.entrada.CargadorRecursos;
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

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ServicioPlanificacionImpl.class);

    // No final: CAMBIO_CONFIGURACION_CIUDAD / CAMBIO_CONFIGURACION_OPERACION como ajuste inicial
    // (ver aplicarAjustesIniciales) remplazan estos dos por una instancia nueva -- son records
    // inmutables, así que "cambiarlos" significa reemplazar la referencia, igual que
    // OrquestadorOperacion.contextoProblema. Nunca se tocan una vez iniciado el ciclo periódico.
    private Ciudad ciudad;
    private ConfiguracionOperacion configuracionOperacion;
    private final List<TipoVehiculo> tiposVehiculo;
    private final List<Almacen> almacenes;
    private final List<UnidadTransporte> flota;
    private final TipoAlgoritmo algoritmoPorDefecto;
    private final Map<String, Object> configAlgoritmo;
    private final String carpetaLogs;
    /**
     * Carga bajo demanda pedidos/bloqueos/mantenimiento oficiales del curso a medida que el reloj
     * simulado los necesita (ver {@link OrquestadorOperacion#asegurarDatosOficialesCargados});
     * reemplaza la subida manual por API como flujo por defecto -- {@link #recibirArchivo} sigue
     * disponible como override manual para casos ad-hoc (p. ej. datos de prueba distintos a los
     * oficiales del curso), pero ya no es necesario en operación normal.
     */
    private final CargadorRecursos cargadorRecursos;

    private final List<Pedido> pedidosRecibidos = new CopyOnWriteArrayList<>();
    private final List<Bloqueo> bloqueosRecibidos = new CopyOnWriteArrayList<>();
    private final List<Mantenimiento> mantenimientosRecibidos = new CopyOnWriteArrayList<>();
    private final Map<String, OrquestadorOperacion> ejecuciones = new ConcurrentHashMap<>();
    private volatile String idEjecucionActiva;

    public ServicioPlanificacionImpl(Ciudad ciudad, ConfiguracionOperacion configuracionOperacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota,
            TipoAlgoritmo algoritmoPorDefecto, Map<String, Object> configAlgoritmo, String carpetaLogs,
            CargadorRecursos cargadorRecursos) {
        this.ciudad = ciudad;
        this.configuracionOperacion = configuracionOperacion;
        this.tiposVehiculo = tiposVehiculo;
        this.almacenes = almacenes;
        this.flota = flota;
        this.algoritmoPorDefecto = algoritmoPorDefecto;
        this.configAlgoritmo = configAlgoritmo;
        this.carpetaLogs = carpetaLogs;
        this.cargadorRecursos = cargadorRecursos;
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
        ContextoProblema contexto = orquestador.getContextoProblema();
        return orquestador.getUltimasRutas().stream()
                .map(r -> EnsambladorRespuestas.aRutaDTO(r, contexto.ciudad(), contexto.bloqueos(), contexto.marcaTiempoActual()))
                .toList();
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
        return seleccionarEscenario(tipo, fechaInicioSimulada, List.of());
    }

    @Override
    public EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada,
            List<SolicitudOperacion> ajustesIniciales) {
        ParametrosOrquestacion defaults = defaultsPara(tipo);
        return seleccionarEscenario(tipo, fechaInicioSimulada, defaults.sa(), defaults.ta(), defaults.k(),
                defaults.tiempoMaximoComputoSegundos(), ajustesIniciales);
    }

    @Override
    public synchronized EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada,
            float sa, float ta, float k, float tiempoMaximoComputoSegundos,
            List<SolicitudOperacion> ajustesIniciales) {
        OrquestadorOperacion orquestadorActivo = ejecucionActivaOrquestador();
        if (orquestadorActivo != null && esEjecucionActiva(orquestadorActivo.getEjecucionActual())) {
            // Solo puede existir una ejecución a la vez en toda la aplicación, sin importar desde
            // qué dispositivo se llame: si ya hay una en curso (o pausada), esta llamada se "une"
            // a ella devolviéndola tal cual, en vez de levantar una segunda instancia independiente
            // corriendo en paralelo (que competiría por CPU y dejaría a los distintos dispositivos
            // viendo estados distintos). Los ajustesIniciales de ESTA llamada se descartan en
            // silencio en ese caso -- solo aplican al arranque de una ejecución genuinamente nueva.
            return orquestadorActivo.getEjecucionActual();
        }

        reiniciarFlotaYAlmacenes();
        aplicarAjustesIniciales(ajustesIniciales, fechaInicioSimulada);

        List<Pedido> pedidosPendientes = pedidosRecibidos.stream()
                .filter(p -> p.getEstado() == EstadoPedido.PENDIENTE)
                .toList();

        // Nótese que aquí se pasa el universo COMPLETO de bloqueos recibidos, sin recortar: el
        // recorte al horizonte relevante lo hace OrquestadorOperacion en cada lote (ver
        // OrquestadorOperacion.bloqueosDelLote), porque la ventana relevante se desplaza a medida
        // que avanza el reloj simulado y llegan pedidos nuevos -- recortar aquí, una sola vez,
        // dejaría fuera bloqueos que sí aplican a pedidos que todavía no existen en este instante.
        ContextoProblema contextoInicial = new ContextoProblema(fechaInicioSimulada, pedidosPendientes,
                List.copyOf(bloqueosRecibidos), List.copyOf(mantenimientosRecibidos), almacenes, flota, ciudad,
                configuracionOperacion);

        var planificador = PlanificadorFactory.crear(algoritmoPorDefecto, configAlgoritmo);
        var gestorLog = new GestorLogSimulacion(carpetaLogs, false);
        OrquestadorOperacion orquestador = new OrquestadorOperacion(planificador, gestorLog, sa, ta, k,
                tiempoMaximoComputoSegundos, contextoInicial, cargadorRecursos);

        EjecucionEscenario ejecucion = orquestador.iniciarCicloPeriodico(tipo);
        ejecuciones.put(ejecucion.getIdEjecucion(), orquestador);
        idEjecucionActiva = ejecucion.getIdEjecucion();
        return ejecucion;
    }

    /**
     * Bug real corregido (confirmado en vivo): {@code flota}/{@code almacenes} son los MISMOS
     * objetos mutables compartidos durante toda la vida del proceso (ver el constructor, son
     * {@code final} inyectados una sola vez) -- sin este reset, una ejecución nueva heredaba en
     * silencio la posición/estado de cada {@link UnidadTransporte} y el stock de cada
     * {@link AlmacenIntermedio} justo en el punto donde una ejecución ANTERIOR (ya detenida) los
     * había dejado, en vez de arrancar desde un estado limpio. Con pruebas cortas (iniciar/detener
     * rápido) esto era casi invisible -- los vehículos apenas se habían alejado del Central --
     * dando la falsa impresión de "siempre una posición por defecto", cuando en realidad arrastraba
     * el estado real (parcial) de la corrida anterior.
     */
    private void reiniciarFlotaYAlmacenes() {
        Nodo posicionCentral = almacenes.stream()
                .filter(AlmacenCentral.class::isInstance)
                .findFirst()
                .map(Almacen::getPosicion)
                .orElse(null);
        flota.forEach(unidad -> {
            if (posicionCentral != null) {
                unidad.setPosicion(posicionCentral);
            }
            unidad.setEstado(EstadoUnidad.DISPONIBLE);
        });
        almacenes.stream()
                .filter(AlmacenIntermedio.class::isInstance)
                .map(AlmacenIntermedio.class::cast)
                .forEach(almacen -> almacen.recargar(LocalDateTime.now()));
    }

    /**
     * Aplica {@code ajustes} directamente sobre el estado compartido ({@code tiposVehiculo},
     * {@code almacenes}, {@code flota}, {@code ciudad}, {@code configuracionOperacion}) ANTES de
     * construir el {@code ContextoProblema} inicial -- mismo catálogo de {@link TipoSolicitud} que
     * {@code OrquestadorOperacion.aplicarSolicitudesVencidas} para los cambios "en caliente", pero
     * sin esa restricción horaria (todos se aplican ya, en {@code fechaInicioSimulada}) y sin la
     * lógica de "abandonar ruta en curso" (no puede haber ninguna todavía: esto corre antes del
     * primer lote). {@code CAMBIO_CONFIGURACION_CIUDAD} SÍ se permite aquí (a diferencia de
     * {@link #programarSolicitud}): ningún vehículo/almacén/pedido depende todavía de la ciudad
     * vigente, así que no hay riesgo de invalidar posiciones ya comprometidas.
     *
     * <p>Cada ajuste se aísla en su propio try/catch (mismo motivo que la versión "en caliente":
     * uno mal formado no debe impedir que los demás se apliquen ni abortar el arranque del
     * escenario).
     */
    private void aplicarAjustesIniciales(List<SolicitudOperacion> ajustes, LocalDateTime fechaInicioSimulada) {
        for (SolicitudOperacion ajuste : ajustes) {
            try {
                switch (ajuste.tipoSolicitud()) {
                    case AVERIA -> aplicarAveriaInicial(ajuste, fechaInicioSimulada);
                    case CAMBIO_VELOCIDAD -> tiposVehiculo.stream()
                            .filter(tv -> tv.getId().equalsIgnoreCase(ajuste.entidadObjetivo()))
                            .forEach(tv -> tv.setVelocidadKmH(Double.parseDouble(ajuste.valorNuevo())));
                    case CAMBIO_CAPACIDAD -> tiposVehiculo.stream()
                            .filter(tv -> tv.getId().equalsIgnoreCase(ajuste.entidadObjetivo()))
                            .forEach(tv -> tv.setCapacidad(Integer.parseInt(ajuste.valorNuevo())));
                    case CAMBIO_CAPACIDAD_ALMACEN -> almacenes.stream()
                            .filter(AlmacenIntermedio.class::isInstance)
                            .map(AlmacenIntermedio.class::cast)
                            .filter(a -> a.getNombre().equalsIgnoreCase(ajuste.entidadObjetivo()))
                            .forEach(a -> a.setCapacidadMaxima(Integer.parseInt(ajuste.valorNuevo())));
                    case CAMBIO_FRECUENCIA_RECARGA -> almacenes.stream()
                            .filter(AlmacenIntermedio.class::isInstance)
                            .map(AlmacenIntermedio.class::cast)
                            .filter(a -> a.getNombre().equalsIgnoreCase(ajuste.entidadObjetivo()))
                            .forEach(a -> a.setFrecuenciaRecargaHoras(Double.parseDouble(ajuste.valorNuevo())));
                    case CAMBIO_POSICION_ALMACEN -> aplicarCambioPosicionAlmacenInicial(ajuste);
                    case CAMBIO_CANTIDAD_VEHICULOS -> aplicarCambioCantidadVehiculosInicial(ajuste, fechaInicioSimulada);
                    case CAMBIO_CONFIGURACION_CIUDAD -> aplicarCambioConfiguracionCiudadInicial(ajuste);
                    case CAMBIO_CONFIGURACION_OPERACION -> aplicarCambioConfiguracionOperacionInicial(ajuste);
                }
            } catch (Exception ex) {
                log.error("Ajuste inicial {} sobre {} descartado por error al aplicarlo: {}", ajuste.tipoSolicitud(),
                        ajuste.entidadObjetivo(), ex.getMessage());
            }
        }
    }

    private void aplicarAveriaInicial(SolicitudOperacion ajuste, LocalDateTime fechaInicioSimulada) {
        flota.stream()
                .filter(u -> u.getIdUnidad().equalsIgnoreCase(ajuste.entidadObjetivo()))
                .findFirst()
                .ifPresent(unidad -> {
                    TipoAveria tipo = TipoAveria.valueOf(ajuste.valorNuevo());
                    LocalDateTime fin = switch (tipo) {
                        case TIPO_1 -> fechaInicioSimulada.plusHours(2);
                        case TIPO_2 -> fechaInicioSimulada.plusHours(4);
                        case TIPO_3 -> fechaInicioSimulada.plusDays(2);
                    };
                    unidad.setAveriaActual(new Averia(tipo, fechaInicioSimulada, fin, 0, fechaInicioSimulada));
                    unidad.setEstado(EstadoUnidad.AVERIADO);
                    if (tipo == TipoAveria.TIPO_2 || tipo == TipoAveria.TIPO_3) {
                        almacenes.stream()
                                .filter(AlmacenCentral.class::isInstance)
                                .findFirst()
                                .ifPresent(central -> unidad.setPosicion(central.getPosicion()));
                    }
                });
    }

    /** Mismo criterio de validación que {@code OrquestadorOperacion.aplicarCambioPosicionAlmacen}. */
    private void aplicarCambioPosicionAlmacenInicial(SolicitudOperacion ajuste) {
        String[] partes = ajuste.valorNuevo().split(",");
        Nodo nuevaPosicion = new Nodo(Integer.parseInt(partes[0].trim()), Integer.parseInt(partes[1].trim()));
        if (!ciudad.esNodoValido(nuevaPosicion)) {
            log.warn("Posición {} fuera de los límites de la ciudad; se descarta el ajuste inicial de posición del almacén {}",
                    nuevaPosicion, ajuste.entidadObjetivo());
            return;
        }
        almacenes.stream()
                .filter(a -> nombreAlmacen(a).equalsIgnoreCase(ajuste.entidadObjetivo()))
                .forEach(a -> a.setPosicion(nuevaPosicion));
    }

    /** Mismo criterio que {@code EnsambladorRespuestas.aAlmacenDTO}: el central no tiene nombre propio. */
    private String nombreAlmacen(Almacen almacen) {
        return almacen instanceof AlmacenIntermedio intermedio ? intermedio.getNombre() : "Central";
    }

    /**
     * {@code entidadObjetivo}: id de {@link TipoVehiculo}. {@code valorNuevo}: cantidad TOTAL
     * deseada de unidades de ese tipo. A diferencia de la versión "en caliente"
     * ({@code OrquestadorOperacion.aplicarCambioCantidadVehiculos}), no hay rutas en curso que
     * proteger todavía -- cualquier unidad del tipo puede retirarse si hay que reducir.
     */
    private void aplicarCambioCantidadVehiculosInicial(SolicitudOperacion ajuste, LocalDateTime fechaInicioSimulada) {
        int cantidadDeseada = Integer.parseInt(ajuste.valorNuevo());
        List<UnidadTransporte> delTipo = flota.stream()
                .filter(u -> u.getTipoVehiculo().getId().equalsIgnoreCase(ajuste.entidadObjetivo()))
                .toList();
        if (delTipo.isEmpty()) {
            log.warn("No existe flota del tipo {} para ajustar su cantidad inicial", ajuste.entidadObjetivo());
            return;
        }

        TipoVehiculo tipo = delTipo.get(0).getTipoVehiculo();
        int diferencia = cantidadDeseada - delTipo.size();
        if (diferencia > 0) {
            Nodo posicionInicial = delTipo.get(0).getPosicion();
            int siguienteCorrelativo = delTipo.size() + 1;
            for (int i = 0; i < diferencia; i++) {
                String nuevoId = tipo.getId() + "-" + (siguienteCorrelativo + i);
                flota.add(new UnidadTransporte(nuevoId, tipo, posicionInicial, fechaInicioSimulada));
            }
        } else if (diferencia < 0) {
            flota.removeAll(delTipo.stream().limit(-diferencia).toList());
        }
    }

    /**
     * {@code entidadObjetivo}: {@code "ancho"}, {@code "alto"} o {@code "distanciaEntreNodos"}.
     * {@code valorNuevo}: nuevo valor numérico. Se rechaza si deja a algún almacén ya posicionado
     * fuera de los límites nuevos -- mismo riesgo sistémico que documenta
     * {@code ServicioPlanificacionImpl.programarSolicitud} para el cambio en caliente, aquí
     * evitado con una validación explícita en vez de prohibir el tipo por completo.
     */
    private void aplicarCambioConfiguracionCiudadInicial(SolicitudOperacion ajuste) {
        double valor = Double.parseDouble(ajuste.valorNuevo());
        Ciudad nueva = switch (ajuste.entidadObjetivo()) {
            case "ancho" -> new Ciudad((int) valor, ciudad.alto(), ciudad.origen(), ciudad.distanciaEntreNodos(),
                    ciudad.callesDobleSentido());
            case "alto" -> new Ciudad(ciudad.ancho(), (int) valor, ciudad.origen(), ciudad.distanciaEntreNodos(),
                    ciudad.callesDobleSentido());
            case "distanciaEntreNodos" -> new Ciudad(ciudad.ancho(), ciudad.alto(), ciudad.origen(), (int) valor,
                    ciudad.callesDobleSentido());
            default -> null;
        };
        if (nueva == null) {
            log.warn("Campo de configuración de ciudad desconocido: {}", ajuste.entidadObjetivo());
            return;
        }
        boolean algunAlmacenFueraDeLimites = almacenes.stream().anyMatch(a -> !nueva.esNodoValido(a.getPosicion()));
        if (algunAlmacenFueraDeLimites) {
            log.warn("Ajuste inicial de ciudad ({}={}) descartado: deja al menos un almacén fuera de los límites nuevos",
                    ajuste.entidadObjetivo(), ajuste.valorNuevo());
            return;
        }
        ciudad = nueva;
    }

    /** Mismo catálogo de campos que {@code OrquestadorOperacion.aplicarCambioConfiguracionOperacion}. */
    private void aplicarCambioConfiguracionOperacionInicial(SolicitudOperacion ajuste) {
        var actual = configuracionOperacion;
        double valor = Double.parseDouble(ajuste.valorNuevo());
        var nueva = switch (ajuste.entidadObjetivo()) {
            case "duracionTurnoHoras" -> new ConfiguracionOperacion(valor, actual.horaInicioTurno(),
                    actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    actual.maxParadasPorRuta());
            case "horaInicioTurno" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(), valor,
                    actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    actual.maxParadasPorRuta());
            case "tiempoServicioClienteHoras" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), valor, actual.duracionRefrigerioHoras(), actual.margenRefrigerioHoras(),
                    actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "duracionRefrigerioHoras" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), valor,
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    actual.maxParadasPorRuta());
            case "margenRefrigerioHoras" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    valor, actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "tiempoCargaAlmacenHoras" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), valor, actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "tiempoTrasvaseHoras" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), valor,
                    actual.maxParadasPorRuta());
            case "maxParadasPorRuta" -> new ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    (int) valor);
            default -> null;
        };
        if (nueva == null) {
            log.warn("Campo de configuración de operación desconocido: {}", ajuste.entidadObjetivo());
            return;
        }
        configuracionOperacion = nueva;
    }

    @Override
    public void programarSolicitud(EjecucionEscenario ejecucion, LocalDateTime tiempoSimulado,
            TipoSolicitud tipoSolicitud, String entidadObjetivo, String valorNuevo) {
        if (tipoSolicitud == TipoSolicitud.CAMBIO_CONFIGURACION_CIUDAD) {
            // Rechazado aquí, a la entrada, en vez de encolarse y descartarse en silencio dentro de
            // OrquestadorOperacion.aplicarSolicitudesVencidas: cambiar las dimensiones de la ciudad
            // en caliente deja posiciones ya existentes fuera de la grilla nueva y CalculadorDistancia
            // lanza IllegalStateException para TODA ruta que las toque -- una caída sistémica, no un
            // error localizado. La configuración de ciudad solo puede fijarse antes de iniciar la
            // ejecución (no existe, por diseño, un canal para cambiarla una vez en curso).
            throw new IllegalArgumentException(
                    "La configuración de ciudad no se puede cambiar una vez iniciada la ejecución; fíjala antes de iniciar el escenario.");
        }
        OrquestadorOperacion orquestador = ejecuciones.get(ejecucion.getIdEjecucion());
        if (orquestador == null) {
            throw new IllegalArgumentException("No hay una ejecución activa con id " + ejecucion.getIdEjecucion());
        }
        orquestador.encolarSolicitud(new SolicitudOperacion(tiempoSimulado, tipoSolicitud, entidadObjetivo, valorNuevo));
    }

    @Override
    public void pausarEjecucion(String idEjecucion) {
        orquestadorDe(idEjecucion).pausar();
    }

    @Override
    public void reanudarEjecucion(String idEjecucion) {
        orquestadorDe(idEjecucion).reanudar();
    }

    @Override
    public void detenerEjecucion(String idEjecucion) {
        orquestadorDe(idEjecucion).detener();
    }

    @Override
    public EjecucionEscenario consultarEjecucion(String idEjecucion) {
        return orquestadorDe(idEjecucion).getEjecucionActual();
    }

    @Override
    public EjecucionEscenario consultarEjecucionActiva() {
        OrquestadorOperacion orquestador = ejecucionActivaOrquestador();
        if (orquestador == null) {
            return null;
        }
        EjecucionEscenario ejecucion = orquestador.getEjecucionActual();
        return esEjecucionActiva(ejecucion) ? ejecucion : null;
    }

    private OrquestadorOperacion orquestadorDe(String idEjecucion) {
        OrquestadorOperacion orquestador = ejecuciones.get(idEjecucion);
        if (orquestador == null) {
            throw new IllegalArgumentException("No hay una ejecución activa con id " + idEjecucion);
        }
        return orquestador;
    }

    /**
     * Deliberadamente SIN filtrar por {@link #esEjecucionActiva}: {@code idEjecucionActiva} sigue
     * apuntando al {@link OrquestadorOperacion} ya detenido hasta que arranca una ejecucion nueva
     * (no se limpia en {@link #detenerEjecucion}), y eso es correcto -- este metodo respalda a
     * {@code consultarEstadoOperacion}/{@code consultarRutasVigentes}/{@code pedidosActuales}, que
     * deben poder seguir mostrando el ultimo estado REAL (congelado) de una ejecucion recien
     * terminada: posiciones finales, rutas finales y, sobre todo, el motivo exacto del corte
     * ({@code ReporteDesempeno.contadorIncumplidos}, que es lo que explica POR QUE se detuvo).
     *
     * <p>Bug real corregido (reporte directo, con captura): una version anterior de este metodo SI
     * filtraba por {@code esEjecucionActiva} -- "arreglaba" que el reloj del front seguia avanzando
     * sin fin despues de detener una ejecucion, pero como efecto secundario, {@code
     * EjecucionDetenidaBanner} (que lee {@code contadorIncumplidos} de este mismo endpoint) se
     * quedo mostrando "0 pedidos incumplidos" en una ejecucion que SI se detuvo por incumplimiento
     * -- el contexto vacio de respaldo trae {@code ReporteDesempeno} en cero, no el real. La causa
     * original del reloj (el front extrapolaba con k sin saber que la ejecucion ya no avanzaba) se
     * corrigio del lado correcto: {@code SimClock} ahora solo extrapola mientras
     * {@code ejecucion.estado} sea realmente {@code EN_CURSO}/{@code INICIADA} -- no hacia falta
     * (ni convenia) que el backend dejara de servir el dato real para lograrlo.
     *
     * <p>{@link #consultarEjecucionActiva()} SI necesita filtrar (es la query de "unirme a una
     * ejecucion en curso" que usa {@code SeleccionarEscenarioGate} al cargar la app) -- aplica su
     * propio chequeo de {@code esEjecucionActiva} de forma independiente, no depende de este metodo
     * para eso.
     */
    private OrquestadorOperacion ejecucionActivaOrquestador() {
        return idEjecucionActiva != null ? ejecuciones.get(idEjecucionActiva) : null;
    }

    /** {@code true} si la ejecución sigue en un estado no terminal (puede recibir lotes futuros). */
    private boolean esEjecucionActiva(EjecucionEscenario ejecucion) {
        if (ejecucion == null) {
            return false;
        }
        return switch (ejecucion.getEstado()) {
            case INICIADA, EN_CURSO, PAUSADA -> true;
            case FINALIZADA, DETENIDA_POR_INCUMPLIMIENTO -> false;
        };
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
     * Valores por defecto de la dinámica de planificación programada. {@code K} sigue lo indicado
     * por el profesor (K=1 para día a día) salvo {@code CINCO_DIAS}, recalibrado a K=150: el PDF
     * oficial del enunciado exige explícitamente que ese escenario "debe tomar en ejecutarse entre
     * 30 y 60 minutos" (real:simulado = 7200/K minutos, independiente de Sa -- ver el comentario
     * de abajo), y el valor ilustrativo original del profesor (K=14) daba ~514 minutos (~8.6
     * horas), muy fuera de ese rango -- violación confirmada de un requisito duro, no un ajuste de
     * calibración libre. K=150 da 48 minutos, a mitad del rango permitido. {@code COLAPSO_LOGISTICO}
     * (K=10, bajado del valor ilustrativo original del profesor K=75) -- el enunciado no fija una
     * duración objetivo para ese escenario (corre "hasta el punto de quiebre", sin ventana fija),
     * pero K=75 se confirmó en vivo demasiado agresivo: la demanda sintética CRECIENTE
     * (generarPedidosSinteticos) ya empieza a competir con plazos de apenas 4 horas, y con
     * horasAvance=(sa/60)*75=25 min/lote eso dejaba muy pocos lotes de margen antes del primer
     * incumplimiento -- confirmado en vivo: colapsaba en ~16 lotes (~6-7 horas simuladas), sin
     * alcanzar a mostrar una rampa real de estrés. K=10 da horasAvance=3.33 min/lote, ~7.5x más
     * granularidad para que el planificador reaccione antes de que un pedido crítico venza.
     * {@code Sa}/{@code Ta}
     * también se confirmaron como libres de ajustar: originalmente 5min/1min (sugerencia inicial
     * del profesor, no un requisito de la consigna) -- bajados primero a 1min/0.5min, y aquí otra
     * vez a 20s/8s tras confirmar en los logs reales que ningún lote, en toda la sesión de
     * pruebas, llegó siquiera a acercarse al presupuesto de cómputo anterior (30s): ningún
     * "supera el presupuesto" se disparó nunca para esta escala de datos. {@code horasAvance =
     * (sa/60)*k} por lote no cambia con este ajuste (la razón de compresión real:simulado la fija
     * K, no Sa), así que el tiempo total para completar un escenario es el mismo; lo único que
     * cambia es que cada paso es más pequeño y frecuente (actualizaciones de UI más suaves, en
     * vez de saltos grandes espaciados). Overridable vía
     * {@link #seleccionarEscenario(TipoEscenario, LocalDateTime, float, float, float, float)}.
     */
    private ParametrosOrquestacion defaultsPara(TipoEscenario tipo) {
        float ta = 8f / 60f;
        float sa = 20f / 60f;
        float tiempoMaximoComputoSegundos = ta * 60f;
        float k = switch (tipo) {
            case DIA_A_DIA -> 1f;
            case CINCO_DIAS -> 150f;
            case COLAPSO_LOGISTICO -> 10f;
        };
        return new ParametrosOrquestacion(sa, ta, k, tiempoMaximoComputoSegundos);
    }
}
