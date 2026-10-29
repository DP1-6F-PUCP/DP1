package com.paqrap.simulador;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Averia;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoParada;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoAveria;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargadorRecursos;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Orquesta la ejecución periódica de un {@link Planificador} (ALNS o IPSO, indistintamente — el
 * orquestador no conoce cuál) según la dinámica de "planificación programada":
 *
 * <ul>
 *   <li>{@code ta}: minutos reales que toma ejecutar una planificación.</li>
 *   <li>{@code sa}: minutos reales entre dos lanzamientos consecutivos de la planificación
 *       ({@code sa > ta}, para que la solución no "se caiga" — la planificación siguiente nunca
 *       debe alcanzar a la anterior).</li>
 *   <li>{@code k}: constante de proporcionalidad entre tiempo simulado y tiempo real. La
 *       sensación de ejecución "más rápida" (p.ej. el escenario de 5 días o de colapso) no se
 *       logra acelerando el algoritmo ni con ningún criterio de optimización adicional — se logra
 *       consumiendo más datos por ciclo: cada {@code sa} minutos reales, el reloj simulado avanza
 *       {@code sa * k} minutos.</li>
 * </ul>
 *
 * <p>Esta dinámica está pensada para el contexto de "planificación programada"; para otros tipos
 * de planificación (p.ej. reactiva pura ante incidencias) habría que revisitar el concepto.
 */
public class OrquestadorOperacion {

    private static final Logger log = LoggerFactory.getLogger(OrquestadorOperacion.class);
    /** Referencia fija (medianoche) para medir ciclos de recarga; ver {@link #recargarAlmacenesSiCorrespondeMedianoche}. */
    private static final LocalDateTime EPOCA_RECARGA = LocalDateTime.of(2000, 1, 1, 0, 0);

    private final float sa;
    private final float ta;
    private final float k;
    private final float tiempoMaximoComputoSegundos;
    private volatile ContextoProblema contextoProblema;
    /**
     * Universo completo de bloqueos conocidos, guardado aparte de {@code contextoProblema} para
     * que cada lote pueda recortarlo fresco a su propio horizonte (ver {@link #bloqueosDelLote})
     * -- si se recortara una sola vez al construir el orquestador, un pedido que llegue después
     * (sintético o de un archivo nuevo) con un plazo fuera de esa ventana inicial podría
     * planificarse ignorando un bloqueo real que sí le aplica.
     */
    private final List<Bloqueo> todosLosBloqueos;
    /**
     * Universo completo de mantenimientos conocidos, con el mismo tratamiento que
     * {@link #todosLosBloqueos}: se acumula aparte de {@code contextoProblema} porque
     * {@link #cargarMantenimientoSiFalta} agrega bimestres nuevos a medida que el reloj avanza.
     */
    private final List<Mantenimiento> todosLosMantenimientos;
    private final List<SolicitudOperacion> solicitudesPendientes = new CopyOnWriteArrayList<>();

    /**
     * Carga bajo demanda los datos oficiales del curso (pedidos, bloqueos, mantenimiento) a medida
     * que el reloj simulado los necesita, para que la operación no dependa de que alguien suba
     * archivos por la API mes a mes -- ver {@link #asegurarDatosOficialesCargados}. {@code null}
     * desactiva la carga automática (p. ej. en pruebas que arman su propio {@code ContextoProblema}
     * completo a mano); en ese caso el comportamiento es el mismo que antes de introducir esto:
     * solo se usan los datos con los que se construyó el orquestador o los subidos manualmente vía
     * {@code ServicioPlanificacion#recibirArchivo}.
     */
    private final CargadorRecursos cargadorRecursos;
    /**
     * Instante de arranque elegido para ESTA ejecución (fijo, no se mueve con
     * {@code contextoProblema.marcaTiempoActual()}). Pedidos históricos con {@code fechaIngreso}
     * anterior a este instante no pertenecen a esta ejecución -- no son "backlog vencido", son de
     * antes de que este run empezara (p. ej. un turno anterior no simulado aquí). Sin este corte,
     * arrancar un DIA_A_DIA a media mañana incorporaría de golpe todo lo de la madrugada, incluidos
     * pedidos cuyo plazo (fechaLimite, que nunca se toca) ya venció antes de que el reloj de esta
     * ejecución siquiera empezara a correr -- confirmado empíricamente con datos reales del curso.
     */
    private final LocalDateTime instanteInicioEscenario;
    private final Set<YearMonth> mesesPedidosCargados = new HashSet<>();
    private final Set<YearMonth> mesesBloqueosCargados = new HashSet<>();
    private final Set<String> bimestresMantenimientoCargados = new HashSet<>();
    private final Set<Bloqueo> bloqueosNotificados = new HashSet<>();
    /** Pedidos recién cargados de un archivo oficial, pendientes de incorporarse al próximo lote. */
    private final List<Pedido> pedidosPorIncorporar = new ArrayList<>();

    private final Planificador planificador;
    private final MotorSimulacion motorSimulacion;
    // Historial de consulta por ejecución; los entregados salen del pool de planificación,
    // pero siguen disponibles para el mapa y las listas con su estado final.
    private final java.util.Map<String, Pedido> historialPedidos = new java.util.LinkedHashMap<>();

    public List<Pedido> getPedidosRecibidos() {
        return historialPedidos.values().stream()
                .filter(p -> !p.getFechaIngreso().isAfter(contextoProblema.marcaTiempoActual()))
                .toList();
    }

    private final ReporteDesempeno reporte = new ReporteDesempeno();

    private EjecucionEscenario ejecucionActual;
    private ScheduledExecutorService programador;
    private volatile boolean detenido = true;
    private volatile boolean pausado = false;

    private volatile List<Ruta> ultimasRutas = List.of();
    private volatile List<com.paqrap.simulador.EventoSimulacion> ultimosEventos = List.of();
    private final List<EventoSimulacion> eventosIncidenciaLote = new ArrayList<>();
    private volatile LocalDateTime anclaUltimoLote;
    private LocalDateTime fechaFinSimulada;

    public OrquestadorOperacion(Planificador planificador, GestorLogSimulacion gestorLog, float sa, float ta,
            float k, float tiempoMaximoComputoSegundos, ContextoProblema contextoInicial,
            CargadorRecursos cargadorRecursos) {
        this.planificador = planificador;
        this.motorSimulacion = new MotorSimulacion(gestorLog);
        this.sa = sa;
        this.ta = ta;
        this.k = k;
        this.tiempoMaximoComputoSegundos = tiempoMaximoComputoSegundos;
        this.contextoProblema = contextoInicial;
        this.todosLosBloqueos = new ArrayList<>(contextoInicial.bloqueos());
        this.todosLosMantenimientos = new ArrayList<>(contextoInicial.mantenimientos());
        this.cargadorRecursos = cargadorRecursos;
        this.instanteInicioEscenario = contextoInicial.marcaTiempoActual();
    }

    /**
     * Verifica que {@code sa > ta} (la planificación siguiente no debe alcanzar a la anterior) y
     * que los parámetros temporales sean positivos.
     *
     * @return {@code true} si la configuración es válida para iniciar el ciclo periódico
     */
    public boolean esConfiguracionValida() {
        return sa > ta && ta > 0 && sa > 0 && k > 0;
    }

    /**
     * Encola un cambio de configuración "en caliente" para aplicarse cuando el reloj simulado
     * alcance {@link SolicitudOperacion#tiempoSimuladoProgramado()}.
     *
     * @param solicitud cambio a aplicar
     */
    public void encolarSolicitud(SolicitudOperacion solicitud) {
        solicitudesPendientes.add(solicitud);
    }

    /**
     * Inicia el ciclo periódico: cada {@code sa} minutos reales se ejecuta
     * {@link #ejecutarSiguienteLote()}.
     *
     * @param tipoEscenario escenario de evaluación a ejecutar
     * @return el registro de la ejecución iniciada
     * @throws IllegalStateException si {@link #esConfiguracionValida()} es falso
     */
    public EjecucionEscenario iniciarCicloPeriodico(TipoEscenario tipoEscenario) {
        if (!esConfiguracionValida()) {
            throw new IllegalStateException("Configuración inválida: se requiere sa > ta > 0 y k > 0 (sa=" + sa
                    + ", ta=" + ta + ", k=" + k + ")");
        }
        this.ejecucionActual = new EjecucionEscenario(UUID.randomUUID().toString(), tipoEscenario,
                contextoProblema.marcaTiempoActual(), sa, k);
        this.fechaFinSimulada = tipoEscenario == TipoEscenario.CINCO_DIAS
                ? contextoProblema.marcaTiempoActual().plusDays(5)
                : null;
        this.ejecucionActual.iniciar();
        this.detenido = false;
        this.bloqueosNotificados.clear();
        notificarCierreDeLote();

        this.programador = Executors.newSingleThreadScheduledExecutor();
        long periodoMs = Math.round(sa * 60_000.0);
        programador.scheduleAtFixedRate(this::ejecutarLoteProtegido, 0, periodoMs, TimeUnit.MILLISECONDS);
        return ejecucionActual;
    }

    /**
     * Bug real corregido (confirmado en vivo: el reloj simulado se congelaba sin ningún rastro en
     * los logs). {@code ScheduledExecutorService.scheduleAtFixedRate} cancela TODAS las
     * ejecuciones futuras de una tarea periódica si esta lanza una excepción no capturada -- en
     * silencio, sin loguear nada, el {@code Future} simplemente queda cancelado y nadie lo
     * observa. Un solo lote con un dato borde (p. ej. un pedido con coordenadas fuera de la
     * ciudad) mataba la ejecución completa para siempre, indistinguible desde fuera de una
     * ejecución sana pero sin pedidos que repartir. Envolver aquí evita que un lote fallido tumbe
     * el ciclo: se loguea el error y el siguiente lote programado sigue intentando con normalidad.
     */
    private void ejecutarLoteProtegido() {
        try {
            ejecutarSiguienteLote();
        } catch (Exception ex) {
            log.error("Lote de planificación falló en la ejecución {}; el ciclo periódico continúa en el próximo lote",
                    ejecucionActual != null ? ejecucionActual.getIdEjecucion() : "?", ex);
        }
    }

    /**
     * Pausa el ciclo periódico: los lotes programados siguen "disparando" cada {@code sa} minutos
     * reales, pero {@link #ejecutarSiguienteLote()} no hace nada mientras {@code pausado} sea
     * verdadero — a diferencia de {@link #detener()}, es reversible (no apaga el
     * {@link ScheduledExecutorService}).
     *
     * @throws IllegalStateException si el ciclo no está en curso
     */
    public void pausar() {
        if (detenido || ejecucionActual == null) {
            throw new IllegalStateException("No hay una ejecución en curso para pausar");
        }
        pausado = true;
        ejecucionActual.setEstado(EstadoEjecucion.PAUSADA);
    }

    /**
     * Reanuda un ciclo previamente pausado con {@link #pausar()}.
     *
     * @throws IllegalStateException si el ciclo no está en curso o no está pausado
     */
    public void reanudar() {
        if (detenido || ejecucionActual == null) {
            throw new IllegalStateException("No hay una ejecución en curso para reanudar");
        }
        pausado = false;
        ejecucionActual.setEstado(EstadoEjecucion.EN_CURSO);
    }

    public boolean estaPausado() {
        return pausado;
    }

    /**
     * Recorta {@link #todosLosBloqueos} al horizonte real de {@code pedidos} (desde el ingreso
     * más temprano hasta el plazo más lejano) -- ver {@link Bloqueo#filtrarEnHorizonte}.
     */
    private List<Bloqueo> bloqueosDelLote(List<Pedido> pedidos, LocalDateTime instanteReferencia) {
        LocalDateTime desde = pedidos.stream().map(Pedido::getFechaIngreso).min(LocalDateTime::compareTo)
                .orElse(instanteReferencia);
        LocalDateTime hasta = pedidos.stream().map(Pedido::getFechaLimite).max(LocalDateTime::compareTo)
                .orElse(instanteReferencia.plusHours(48));
        return Bloqueo.filtrarEnHorizonte(todosLosBloqueos, desde, hasta);
    }

    /**
     * Asegura que los datos oficiales del curso estén cargados para el mes de {@code instante}.
     * Bloqueos y mantenimiento se cargan también un mes por adelantado -- el margen extra evita
     * que un lote aterrice justo en un mes aún no cargado cuando {@code sa * k} avanza varias
     * horas de una sola vez (p. ej. escenario de colapso logístico), y no tiene costo: son datos
     * de disponibilidad/tránsito, no candidatos a planificar. Pedidos, en cambio, SOLO se cargan
     * del mes actual: adelantarlos inflaría el problema que ve el planificador con pedidos de un
     * mes que ni siquiera ha empezado (confirmado empíricamente -- precargar +1 mes duplicó el
     * tamaño de la instancia del primer lote y disparó su tiempo de cómputo varias veces). No hace
     * nada si no hay {@link #cargadorRecursos} configurado (carga automática desactivada).
     */
    private void asegurarDatosOficialesCargados(LocalDateTime instante) {
        if (cargadorRecursos == null) {
            return;
        }
        cargarPedidosSiFalta(YearMonth.from(instante));
        for (YearMonth mes : List.of(YearMonth.from(instante), YearMonth.from(instante).plusMonths(1))) {
            cargarBloqueosSiFalta(mes);
            int mes1Bimestre = ((mes.getMonthValue() - 1) / 2) * 2 + 1;
            cargarMantenimientoSiFalta(mes.getYear(), mes1Bimestre);
        }
    }

    /**
     * Carga el archivo oficial de pedidos del mes dado, si aún no se había cargado. A diferencia
     * de bloqueos/mantenimiento, no hay reciclaje cíclico entre años -- el profesor confirmó que
     * ningún algoritmo agota los pedidos ya provistos por el curso (2026-2028), así que un mes sin
     * archivo real simplemente no aporta pedidos nuevos (se registra, no se trata como error).
     *
     * <p>Descarta de una los pedidos con {@code fechaIngreso} anterior a
     * {@link #instanteInicioEscenario}: no pertenecen a esta ejecución (ver el comentario del
     * campo), así que ni siquiera entran a {@link #pedidosPorIncorporar}.
     */
    private void cargarPedidosSiFalta(YearMonth mes) {
        if (!mesesPedidosCargados.add(mes)) {
            return;
        }
        try {
            cargadorRecursos.cargarPedidos(mes.getYear(), mes.getMonthValue()).getPedidos().stream()
                    .filter(p -> !p.getFechaIngreso().isBefore(instanteInicioEscenario))
                    .forEach(pedidosPorIncorporar::add);
        } catch (IOException ex) {
            log.info("Sin pedidos oficiales para {} (fuera del rango provisto por el curso): {}", mes,
                    ex.getMessage());
        }
    }

    /** Carga los bloqueos oficiales del mes dado (con reciclaje cíclico de año, ver {@link CargadorRecursos}). */
    private void cargarBloqueosSiFalta(YearMonth mes) {
        if (!mesesBloqueosCargados.add(mes)) {
            return;
        }
        try {
            todosLosBloqueos.addAll(cargadorRecursos.cargarBloqueos(mes.getYear(), mes.getMonthValue()).getBloqueos());
        } catch (IOException ex) {
            log.warn("No se pudieron cargar los bloqueos oficiales de {}: {}", mes, ex.getMessage());
        }
    }

    /** Carga el mantenimiento oficial del bimestre {@code [mes1, mes1+1]} de {@code anio} (plantilla reutilizada). */
    private void cargarMantenimientoSiFalta(int anio, int mes1) {
        String clave = anio + "-" + mes1;
        if (!bimestresMantenimientoCargados.add(clave)) {
            return;
        }
        try {
            todosLosMantenimientos.addAll(
                    cargadorRecursos.cargarMantenimiento(anio, mes1, mes1 + 1, contextoProblema.vehiculos()));
        } catch (IOException ex) {
            log.warn("No se pudo cargar el mantenimiento oficial del bimestre {}-{} de {}: {}", mes1, mes1 + 1,
                    anio, ex.getMessage());
        }
    }

    /**
     * Ejecuta un ciclo: aplica solicitudes vencidas, invoca al planificador, simula el avance de
     * {@code sa * k} minutos de tiempo simulado y actualiza el contexto y el reporte de
     * desempeño. Se detiene automáticamente si detecta un pedido incumplido (falla dura: la
     * política de entrega a tiempo es irrenunciable).
     */
    public void ejecutarSiguienteLote() {
        if (detenido || pausado) {
            return;
        }

        // Desglose de tiempo por fase (bug real en investigacion: reporte directo de hasta 157s
        // reales sin que el reloj avance, mientras la CPU del contenedor estaba casi en 0% -- no
        // es un bloqueo/deadlock, es alguna fase tomando mucho mas de lo esperado. El log anterior
        // solo media planificador.planificarRutas(), que en el lote sospechoso dio 0.000s -- la
        // demora esta en otra parte de este metodo. Se mide cada fase para encontrar cual.
        long tInicioLote = System.currentTimeMillis();
        eventosIncidenciaLote.clear();
        asegurarDatosOficialesCargados(contextoProblema.marcaTiempoActual());
        registrarBloqueosActivos();
        long tDespuesCarga = System.currentTimeMillis();
        aplicarSolicitudesVencidas();
        liberarAveriasVencidas(contextoProblema.marcaTiempoActual());
        aplicarMantenimientos(contextoProblema.marcaTiempoActual());
        long tDespuesSolicitudes = System.currentTimeMillis();

        // Q&A oficial del curso (fila 16, respuesta sobre CAMBIO_VELOCIDAD en caliente): "todo
        // vehículo en el almacén o en ruta es vuelto a planificar en cada iteración, al margen que
        // luego de la planificación mantenga la misma ruta o cambie" -- a diferencia de la versión
        // anterior de este método (que protegía toda ruta EN_EJECUCION de principio a fin), cada
        // lote abandona la ruta de TODO vehículo que no esté en medio de un handoff físico real
        // (ver más abajo) y libera sus pedidos aún no entregados al mismo pool que compite el
        // planificador; si nada cambió, lo más probable es que el planificador le devuelva la
        // misma secuencia -- "cumple" la regla igual, sin desperdiciar cómputo artificialmente.
        //
        // Única excepción deliberada: un vehículo ActividadVehiculo.ENTREGANDO (ya llegó al
        // destino y está a mitad del servicio de 1h) no se toca -- no tiene sentido de negocio
        // "replanificar" un paquete que ya está en la puerta del cliente a mitad de entrega. Su
        // ruta completa (incluidas las paradas aún no visitadas DESPUÉS de esta) se protege tal
        // cual hasta que termine ese servicio; se vuelve candidata a replanificación recién en el
        // lote donde ya no esté ENTREGANDO.
        List<Ruta> rutasEnEjecucion = contextoProblema.vehiculos().stream()
                .map(UnidadTransporte::rutaEnEjecucion)
                .filter(java.util.Objects::nonNull)
                .toList();
        //
        // Revisión posterior (reporte directo con capturas: "este vehículo cambiaba de ruta a cada
        // rato", "nunca llegó al destino que me marcaba"): abandonar TODA ruta en cada lote hacía
        // que el planificador redistribuyera la flota desde cero cada sa segundos -- con IPSO, cuyo
        // agrupamiento depende de la posición de cada vehículo, las asignaciones se intercambiaban
        // entre lotes y los vehículos zigzagueaban sin llegar nunca. La regla pide RE-EVALUAR a
        // todos en cada iteración, no cambiarles la ruta siempre ("al margen que luego mantenga la
        // misma ruta o cambie"): ahora una ruta en curso se mantiene si sigue siendo factible (ver
        // sigueSiendoFactible) y solo se replanifica si dejó de serlo.
        LocalDateTime instanteEvaluacion = contextoProblema.marcaTiempoActual();
        List<Ruta> rutasEnCurso = rutasEnEjecucion.stream()
                .filter(r -> r.getUnidadTransporte().getActividadActual() == com.paqrap.dominio.ActividadVehiculo.ENTREGANDO
                        || sigueSiendoFactible(r, instanteEvaluacion))
                .toList();
        abandonarRutasParaReplanificar(rutasEnEjecucion, rutasEnCurso);
        Set<Pedido> pedidosEnRutasEnCurso = rutasEnCurso.stream()
                .flatMap(r -> r.getSecuenciaParadas().stream())
                .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA)
                .map(ParadaPlanificada::getPedido)
                .collect(java.util.stream.Collectors.toSet());

        List<Pedido> pedidosDelLote = new ArrayList<>(contextoProblema.pedidos());
        // pedidosPorIncorporar puede traer de golpe el archivo de un mes entero (p. ej. 5000
        // pedidos) apenas se auto-carga -- solo se le entregan al planificador los que ya
        // "llegaron" (fechaIngreso <= instante de este lote); el resto se queda en la cola para
        // que lotes futuros los incorporen cuando su momento llegue. Sin este filtro, el
        // planificador vería de una todo el mes desde el primer lote, igual que pasaba con los
        // bloqueos antes de recortarlos por horizonte (ver bloqueosDelLote).
        if (!pedidosPorIncorporar.isEmpty()) {
            LocalDateTime ahora = contextoProblema.marcaTiempoActual();
            List<Pedido> liberadosAhora = pedidosPorIncorporar.stream()
                    .filter(p -> !p.getFechaIngreso().isAfter(ahora))
                    .toList();
            pedidosDelLote.addAll(liberadosAhora);
            pedidosPorIncorporar.removeAll(liberadosAhora);
        }

        pedidosDelLote.forEach(p -> historialPedidos.put(p.getIdPedido(), p));

        // Al planificador se le ofrecen todos los pedidos vigentes salvo los de una ruta protegida
        // (vehículo ENTREGANDO ahora mismo, ver arriba) -- todo lo demás, incluidos los pedidos de
        // una ruta recién abandonada por abandonarRutasParaReplanificar, SÍ vuelve a competir.
        List<Pedido> pedidosParaPlanificar = pedidosDelLote.stream()
                .filter(p -> !pedidosEnRutasEnCurso.contains(p))
                .toList();

        // Recorta el universo completo de bloqueos al horizonte real de ESTE lote (desde el
        // ingreso más temprano hasta el plazo más lejano de los pedidos vigentes) -- evita que
        // cada consulta de distancia tenga que descartar, una y otra vez, bloqueos de meses que
        // no tienen nada que ver con lo que se está planificando ahora mismo.
        List<Bloqueo> bloqueosDelLote = bloqueosDelLote(pedidosDelLote, contextoProblema.marcaTiempoActual());
        ContextoProblema contextoDelLote = new ContextoProblema(contextoProblema.marcaTiempoActual(),
                pedidosParaPlanificar, bloqueosDelLote, todosLosMantenimientos,
                contextoProblema.almacenes(), contextoProblema.vehiculos(), contextoProblema.ciudad(),
                contextoProblema.configuracionOperacion());

        long inicioMs = System.currentTimeMillis();
        List<Ruta> rutasNuevas = planificador.planificarRutas(contextoDelLote);
        // Ni ALNS ni IPSO registran la ruta que crean en UnidadTransporte.getRutas() -- sin esto,
        // UnidadTransporte.rutaEnEjecucion() (de donde sale rutasEnCurso arriba) siempre
        // encontraba una lista vacía y devolvía null, así que el fix de continuidad entre lotes
        // nunca se activaba en la práctica (bug real, confirmado: esta línea faltaba por completo
        // en todo el código antes de este fix).
        for (Ruta ruta : rutasNuevas) {
            ruta.getUnidadTransporte().agregarRuta(ruta);
        }
        double segundosComputo = (System.currentTimeMillis() - inicioMs) / 1000.0;
        // Instrumentacion temporal para recalibrar ConfiguracionALNS.maxIteraciones contra carga
        // real (pedido directo: "recalibremos" tras encontrar que el 350 actual nunca se valido
        // empiricamente -- el experimento historico solo igualo el presupuesto con IPSO a 300,
        // nunca lo tuneo). getUltimaIteracionMejora() ya existia en SolucionadorALNS como
        // diagnostico de convergencia; nunca se habia conectado a logging en produccion. Si la
        // mejora deja de ocurrir mucho antes de maxIteraciones en lotes reales pesados, es
        // evidencia directa de presupuesto desperdiciado.
        if (planificador instanceof com.paqrap.alns.SolucionadorALNS alns) {
            log.info("Convergencia ALNS: ultima mejora en iteracion {} ({} pedidos en este lote)",
                    alns.getUltimaIteracionMejora(), pedidosParaPlanificar.size());
        }
        // INFO siempre (no solo al exceder el presupuesto): visibilidad operativa real del costo
        // de cada lote -- antes solo se sabia si se disparaba el warning de "supera el
        // presupuesto", sin ningun numero para los casos normales. Util para calibrar sa/ta contra
        // datos reales (p. ej. los meses mas pesados del curso, 2027-2028, que plafonan en 5000
        // pedidos/mes) sin tener que instrumentar el codigo cada vez.
        log.info("Lote planificado: {} pedidos ofrecidos, {} rutas nuevas, {}s de computo",
                pedidosParaPlanificar.size(), rutasNuevas.size(), String.format(java.util.Locale.US, "%.3f", segundosComputo));
        if (segundosComputo > tiempoMaximoComputoSegundos) {
            log.warn("La planificación tomó {}s, supera el presupuesto de {}s", segundosComputo,
                    tiempoMaximoComputoSegundos);
        }

        List<Ruta> todasLasRutas = new ArrayList<>(rutasEnCurso);
        todasLasRutas.addAll(rutasNuevas);

        double horasAvance = (sa / 60.0) * k;
        if (fechaFinSimulada != null) {
            long segundosRestantes = Duration.between(contextoProblema.marcaTiempoActual(), fechaFinSimulada)
                    .getSeconds();
            horasAvance = Math.min(horasAvance, Math.max(0, segundosRestantes) / 3600.0);
        }
        List<Pedido> noAsignados = pedidosNoAsignados(todasLasRutas, pedidosDelLote);
        anclaUltimoLote = contextoProblema.marcaTiempoActual();
        long tAntesSimular = System.currentTimeMillis();
        ultimosEventos = new ArrayList<>(
                motorSimulacion.simularRutas(todasLasRutas, noAsignados, contextoDelLote, 0.0, horasAvance));
        ultimasRutas = todasLasRutas;
        long tDespuesSimular = System.currentTimeMillis();

        // Solo se suma el costo de las rutas NUEVAS -- el de las que ya venían EN_EJECUCION se
        // contabilizó una única vez, en el lote donde se planificaron por primera vez.
        for (Ruta ruta : rutasNuevas) {
            reporte.sumarCosto(ruta.getCostoEstimado());
        }
        reporte.incrementarEntregados(motorSimulacion.getPedidosCompletados().size());

        LocalDateTime instanteAnterior = contextoProblema.marcaTiempoActual();
        LocalDateTime nuevoInstante = instanteAnterior.plusSeconds(Math.round(horasAvance * 3600.0));
        if (fechaFinSimulada != null && nuevoInstante.isAfter(fechaFinSimulada)) {
            nuevoInstante = fechaFinSimulada;
        }
        registrarBloqueosQueComienzan(instanteAnterior, nuevoInstante);
        ultimosEventos.addAll(eventosIncidenciaLote);

        recargarAlmacenesSiCorrespondeMedianoche(instanteAnterior, nuevoInstante);

        List<Pedido> pedidosVigentes = actualizarEstadosYFiltrarPendientes(pedidosDelLote, nuevoInstante, todasLasRutas);
        long tFinLote = System.currentTimeMillis();
        // Desglose completo del lote -- ver el comentario de tInicioLote. "simular" es
        // MotorSimulacion.simularRutas (recorre TODAS las rutas en_curso+nuevas, llama
        // CalculadorDistancia por cada tramo -- la sospecha principal con rutasEnCurso creciendo
        // sin tope en escenarios largos); "cierre" cubre recarga de almacenes + estados de pedidos.
        log.info("Desglose de lote: carga={}ms solicitudes={}ms planificar={}ms simular={}ms cierre={}ms TOTAL={}ms"
                        + " ({} rutas en curso, {} rutas nuevas)",
                tDespuesCarga - tInicioLote, tDespuesSolicitudes - tDespuesCarga, Math.round(segundosComputo * 1000),
                tDespuesSimular - tAntesSimular, tFinLote - tDespuesSimular, tFinLote - tInicioLote,
                rutasEnCurso.size(), rutasNuevas.size());

        // Se guarda con el universo COMPLETO (todosLosBloqueos/todosLosMantenimientos), no con las
        // versiones recortadas de este lote -- así el próximo lote vuelve a recortar fresco según
        // sus propios pedidos vigentes.
        contextoProblema = new ContextoProblema(nuevoInstante, pedidosVigentes, todosLosBloqueos,
                todosLosMantenimientos, contextoProblema.almacenes(), contextoProblema.vehiculos(),
                contextoProblema.ciudad(), contextoProblema.configuracionOperacion());

        boolean hayIncumplimiento = pedidosVigentes.stream().anyMatch(p -> p.getEstado() == EstadoPedido.INCUMPLIDA);
        if (hayIncumplimiento) {
            reporte.incrementarIncumplidos(1);
            ejecucionActual.setEstado(EstadoEjecucion.DETENIDA_POR_INCUMPLIMIENTO);
            detener();
            notificarCierreDeLote();
            return;
        }

        if (fechaFinSimulada != null && !nuevoInstante.isBefore(fechaFinSimulada)) {
            detener();
            notificarCierreDeLote();
            return;
        }

        ejecucionActual.setEstado(EstadoEjecucion.EN_CURSO);
        notificarCierreDeLote();
    }

    /**
     * Callback que se invoca en ESTE hilo (el del ciclo periódico) justo al cerrar cada lote,
     * cuando el estado ya quedó consistente -- ver {@code ServicioPlanificacionImpl}, que lo usa
     * para publicar una instantánea inmutable del estado.
     *
     * <p>Bug real corregido: las consultas REST/WebSocket leían directamente los objetos mutables
     * del dominio desde otro hilo, sin sincronización, mientras este hilo los modificaba a medio
     * lote ({@code abandonarRutasParaReplanificar} deja vehículos {@code DISPONIBLE} y rutas
     * {@code REEMPLAZADA} ANTES de planificar; {@code MotorSimulacion} mueve posiciones vehículo
     * por vehículo). Una consulta que caía en ese intervalo devolvía un estado a medias -- p. ej.
     * un vehículo en ruta sin ruta activa -- y el visualizador perdía su camino real.
     */
    private volatile Runnable alCerrarLote;

    public void setAlCerrarLote(Runnable alCerrarLote) {
        this.alCerrarLote = alCerrarLote;
    }

    private void notificarCierreDeLote() {
        Runnable callback = alCerrarLote;
        if (callback == null) {
            return;
        }
        try {
            callback.run();
        } catch (Exception ex) {
            log.error("Falló la publicación del estado al cerrar el lote", ex);
        }
    }

    private void registrarBloqueosActivos() {
        LocalDateTime ahora = contextoProblema.marcaTiempoActual();
        todosLosBloqueos.stream()
                .filter(bloqueo -> bloqueo.estaVigente(ahora))
                .filter(bloqueo -> bloqueosNotificados.add(bloqueo))
                .forEach(bloqueo -> eventosIncidenciaLote.add(
                        motorSimulacion.registrarBloqueoCalle(0.0, contextoProblema, bloqueo)));
    }

    private void registrarBloqueosQueComienzan(LocalDateTime desde, LocalDateTime hasta) {
        todosLosBloqueos.stream()
                .filter(bloqueo -> !bloqueo.getFechaInicio().isBefore(desde)
                        && !bloqueo.getFechaInicio().isAfter(hasta))
                .filter(bloqueo -> bloqueosNotificados.add(bloqueo))
                .forEach(bloqueo -> {
                    double horasDesdeInicio = java.time.Duration.between(desde, bloqueo.getFechaInicio())
                            .toSeconds() / 3600.0;
                    eventosIncidenciaLote.add(
                            motorSimulacion.registrarBloqueoCalle(horasDesdeInicio, contextoProblema, bloqueo));
                });
    }

    /** Detiene el ciclo periódico. Si la ejecución no terminó por incumplimiento, la marca {@code FINALIZADA}. */
    public void detener() {
        detenido = true;
        if (programador != null) {
            programador.shutdown();
        }
        if (ejecucionActual != null && ejecucionActual.getEstado() != EstadoEjecucion.DETENIDA_POR_INCUMPLIMIENTO) {
            ejecucionActual.setEstado(EstadoEjecucion.FINALIZADA);
        }
    }

    public ContextoProblema getContextoProblema() {
        return contextoProblema;
    }

    public ReporteDesempeno getReporte() {
        return reporte;
    }

    public EjecucionEscenario getEjecucionActual() {
        return ejecucionActual;
    }

    /** @return las rutas calculadas en el último lote ejecutado (vacío si aún no corrió ninguno) */
    public List<Ruta> getUltimasRutas() {
        return ultimasRutas;
    }

    /** @return los eventos de simulación generados en el último lote ejecutado */
    public List<com.paqrap.simulador.EventoSimulacion> getUltimosEventos() {
        return ultimosEventos;
    }

    /** @return el instante simulado desde el cual {@link #getUltimosEventos()} mide sus horas relativas */
    public LocalDateTime getAnclaUltimoLote() {
        return anclaUltimoLote;
    }

    private List<Pedido> pedidosNoAsignados(List<Ruta> rutas, List<Pedido> todosPedidos) {
        var asignados = rutas.stream()
                .flatMap(r -> r.getSecuenciaParadas().stream())
                .map(ParadaPlanificada::getPedido)
                .collect(java.util.stream.Collectors.toSet());
        return todosPedidos.stream().filter(p -> !asignados.contains(p)).toList();
    }

    private List<Pedido> actualizarEstadosYFiltrarPendientes(List<Pedido> pedidos, LocalDateTime nuevoInstante,
            List<Ruta> rutas) {
        // Bug real corregido (reproducido: CINCO_DIAS desde 2027-08-01, PED-2027-08-0217): el
        // plazo se cumple con la LLEGADA -- MotorSimulacion evalúa "a tiempo" contra
        // horaInicioServicio, el plazo excluye la hora de entrega --, pero Pedido.actualizarEstado
        // solo ve paradas CUMPLIDA (servicio terminado). Un vehículo que llegaba a las 14:08 con
        // plazo 14:18 dejaba el pedido INCUMPLIDA a las 14:30, a mitad del servicio, y detenía la
        // simulación. Un pedido con servicio iniciado dentro del plazo sigue PENDIENTE hasta que
        // ese servicio termine.
        Set<Pedido> llegadosATiempo = rutas.stream()
                .filter(r -> r.getEstado() == EstadoRuta.EN_EJECUCION)
                .flatMap(r -> r.getSecuenciaParadas().stream())
                .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA && p.getEstado() != EstadoParada.REASIGNADA
                        && p.getHoraInicioServicio() != null
                        && !p.getHoraInicioServicio().isAfter(p.getPedido().getFechaLimite()))
                .map(ParadaPlanificada::getPedido)
                .collect(java.util.stream.Collectors.toSet());
        List<Pedido> vigentes = new ArrayList<>();
        for (Pedido pedido : pedidos) {
            pedido.actualizarEstado(llegadosATiempo.contains(pedido) ? pedido.getFechaLimite() : nuevoInstante);
            if (pedido.getEstado() == EstadoPedido.PENDIENTE) {
                vigentes.add(pedido);
            } else if (pedido.getEstado() == EstadoPedido.INCUMPLIDA) {
                vigentes.add(pedido);
            }
        }
        return vigentes;
    }

    /**
     * Recarga cada almacén intermedio una vez por cada límite de su propia
     * {@code frecuenciaRecargaHoras} cruzado entre {@code desde} y {@code hasta} -- no una sola vez
     * sin importar cuántos límites saltó el lote. Con {@code AlmacenIntermedio.recargar()} siendo
     * idempotente (reset directo a capacidadMaxima) el resultado final da igual para un lote que
     * cruza un solo límite, pero esto queda semánticamente correcto ante un {@code k} lo bastante
     * agresivo como para que un solo lote cruce varios -- relevante sobre todo para
     * {@code COLAPSO_LOGISTICO}, cuyo K=75 es solo el valor ilustrativo del profesor, no uno
     * calibrado, y ese escenario en particular incentiva acelerar mucho el reloj para no esperar
     * días reales de prueba.
     *
     * <p>Los límites se miden desde una referencia fija ({@link #EPOCA_RECARGA}, medianoche) en vez
     * de llevar un campo de "última recarga" por almacén: con la frecuencia default de 24h esto
     * reproduce exactamente el cruce de medianoche de antes, y generaliza a cualquier frecuencia
     * sin estado mutable adicional.
     */
    private void recargarAlmacenesSiCorrespondeMedianoche(LocalDateTime desde, LocalDateTime hasta) {
        for (var almacen : contextoProblema.almacenes()) {
            if (almacen instanceof AlmacenIntermedio intermedio) {
                long minutosPorCiclo = (long) (intermedio.getFrecuenciaRecargaHoras() * 60);
                long cicloDesde = Math.floorDiv(java.time.Duration.between(EPOCA_RECARGA, desde).toMinutes(), minutosPorCiclo);
                long cicloHasta = Math.floorDiv(java.time.Duration.between(EPOCA_RECARGA, hasta).toMinutes(), minutosPorCiclo);
                for (long ciclo = cicloDesde + 1; ciclo <= cicloHasta; ciclo++) {
                    intermedio.recargar(EPOCA_RECARGA.plusMinutes(ciclo * minutosPorCiclo));
                }
            }
        }
    }

    /**
     * Aplica las solicitudes cuyo {@code tiempoSimuladoProgramado} ya se alcanzó. Implementados:
     * {@code AVERIA}, {@code CAMBIO_VELOCIDAD}, {@code CAMBIO_CAPACIDAD},
     * {@code CAMBIO_CAPACIDAD_ALMACEN}, {@code CAMBIO_POSICION_ALMACEN},
     * {@code CAMBIO_CANTIDAD_VEHICULOS}, {@code CAMBIO_FRECUENCIA_RECARGA} y
     * {@code CAMBIO_CONFIGURACION_OPERACION}. {@code CAMBIO_CONFIGURACION_CIUDAD} se rechaza antes
     * de llegar aquí (ver {@code ServicioPlanificacionImpl.programarSolicitud}): cambiar las
     * dimensiones de la ciudad en caliente deja posiciones ya existentes (vehículos, almacenes,
     * pedidos) fuera de la grilla nueva, y {@code CalculadorDistancia} lanza
     * {@code IllegalStateException} para TODO cálculo de ruta que las toque -- una caída sistémica,
     * no un error localizado. Esta configuración solo puede fijarse antes de iniciar la ejecución.
     */
    private void aplicarSolicitudesVencidas() {
        LocalDateTime ahora = contextoProblema.marcaTiempoActual();
        List<SolicitudOperacion> vencidas = solicitudesPendientes.stream()
                .filter(s -> !s.tiempoSimuladoProgramado().isAfter(ahora))
                .toList();

        for (SolicitudOperacion solicitud : vencidas) {
            // Bug real corregido (confirmado en vivo): una solicitud mal formada (p. ej.
            // valorNuevo que no matchea el enum esperado) lanzaba una excepcion que: (a) nunca
            // llegaba a la linea de abajo que la retira de solicitudesPendientes, asi que se
            // reintentaba en CADA lote futuro para siempre, y (b) escapaba de este metodo y de
            // ejecutarSiguienteLote() entera, abortando el lote ANTES de llegar al codigo que
            // avanza el reloj simulado -- una sola solicitud rota dejaba el reloj congelado para
            // siempre, no solo descartaba esa solicitud. Aislar el fallo por solicitud (no por
            // lote entero, ver ejecutarLoteProtegido) y retirarla de la cola SIEMPRE, se aplicara
            // o no, es lo que evita ambos efectos.
            try {
                switch (solicitud.tipoSolicitud()) {
                    case AVERIA -> aplicarAveria(solicitud);
                    case CAMBIO_VELOCIDAD -> aplicarCambioVelocidad(solicitud);
                    case CAMBIO_CAPACIDAD -> aplicarCambioCapacidad(solicitud);
                    case CAMBIO_CAPACIDAD_ALMACEN -> aplicarCambioCapacidadAlmacen(solicitud);
                    case CAMBIO_POSICION_ALMACEN -> aplicarCambioPosicionAlmacen(solicitud);
                    case CAMBIO_CANTIDAD_VEHICULOS -> aplicarCambioCantidadVehiculos(solicitud);
                    case CAMBIO_FRECUENCIA_RECARGA -> aplicarCambioFrecuenciaRecarga(solicitud);
                    case CAMBIO_CONFIGURACION_OPERACION -> aplicarCambioConfiguracionOperacion(solicitud);
                    default -> log.warn("Tipo de solicitud aún no implementado: {}", solicitud.tipoSolicitud());
                }
            } catch (Exception ex) {
                log.error("Solicitud {} sobre {} descartada por error al aplicarla: {}", solicitud.tipoSolicitud(),
                        solicitud.entidadObjetivo(), ex.getMessage());
            }
            solicitudesPendientes.remove(solicitud);
        }
    }

    /**
     * Marca {@code EN_MANTENIMIENTO} cada unidad cuyo mantenimiento programado cubre el instante
     * dado, y la libera de vuelta a {@code DISPONIBLE} cuando la ventana termina. A diferencia de
     * los bloqueos, no requiere recorte de horizonte por rendimiento: es un barrido O(mantenimientos)
     * sobre una lista pequeña (archivo bimensual), no una consulta repetida por cálculo de distancia.
     */
    private void aplicarMantenimientos(LocalDateTime instante) {
        // Bug real corregido (reproducido: CINCO_DIAS desde 2026-10-21, PED-2026-10-3973 incumplido
        // con TM04 parado 7h en la puerta del cliente): la ventana se evaluaba registro por
        // registro, y una unidad tiene VARIOS (la plantilla se repite cada bimestre). El registro
        // de hoy la ponía EN_MANTENIMIENTO y le quitaba la ruta; el de otra fecha, fuera de
        // ventana, la devolvía a DISPONIBLE en el mismo recorrido -- así recibía una ruta nueva
        // cada lote, que el lote siguiente volvía a quitarle, y el servicio de 1h nunca terminaba.
        // Ahora se decide una sola vez por unidad: en mantenimiento si CUALQUIER registro la cubre.
        Set<UnidadTransporte> enVentana = new HashSet<>();
        Set<UnidadTransporte> conRegistros = new java.util.LinkedHashSet<>();
        for (Mantenimiento mantenimiento : contextoProblema.mantenimientos()) {
            conRegistros.add(mantenimiento.vehiculoAfectado());
            if (!instante.isBefore(mantenimiento.fechaInicio()) && instante.isBefore(mantenimiento.fechaFinCalculada())) {
                enVentana.add(mantenimiento.vehiculoAfectado());
            }
        }
        for (UnidadTransporte unidad : conRegistros) {
            boolean dentroDeVentana = enVentana.contains(unidad);
            if (dentroDeVentana && unidad.getEstado() != EstadoUnidad.AVERIADO
                    && unidad.getEstado() != EstadoUnidad.EN_MANTENIMIENTO) {
                // Igual que en aplicarAveria: si entra a mantenimiento con una ruta EN_EJECUCION,
                // la abandona -- sus paradas pendientes quedan REASIGNADA para que otro vehículo
                // las retome el próximo lote, en vez de dejarla EN_EJECUCION para siempre.
                Ruta rutaEnCurso = unidad.rutaEnEjecucion();
                if (rutaEnCurso != null) {
                    rutaEnCurso.setEstado(EstadoRuta.REEMPLAZADA);
                    long liberadas = rutaEnCurso.getSecuenciaParadas().stream()
                            .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA)
                            .peek(p -> p.setEstado(EstadoParada.REASIGNADA))
                            .count();
                    motorSimulacion.registrarReplanificacion(0.0, contextoProblema, unidad.getIdUnidad(),
                            (int) liberadas, "mantenimiento programado");
                }
                unidad.setEstado(EstadoUnidad.EN_MANTENIMIENTO);
                unidad.setActividadActual(com.paqrap.dominio.ActividadVehiculo.INACTIVO);
            } else if (!dentroDeVentana && unidad.getEstado() == EstadoUnidad.EN_MANTENIMIENTO) {
                unidad.setEstado(EstadoUnidad.DISPONIBLE);
            }
        }
    }

    /**
     * Abandona toda ruta EN_EJECUCION que no esté en {@code protegidas} (ver el comentario de
     * {@code ejecutarSiguienteLote} sobre la regla oficial de replanificación por iteración): la
     * marca {@code REEMPLAZADA}, sus paradas aún no cumplidas quedan {@code REASIGNADA} (mismo
     * mecanismo que ya usan {@code aplicarAveria}/{@code aplicarMantenimientos}) y la unidad vuelve
     * a {@code DISPONIBLE} en su posición ACTUAL -- no en el almacén -- para competir de nuevo por
     * una asignación en este mismo lote. No se emite evento de incidencia: a diferencia de una
     * avería o un mantenimiento, esto no es un incidente que el visualizador deba alertar, ocurre
     * en todo lote por diseño.
     *
     * <p>Simplificación de alcance heredada (ver {@code EvaluadorCostos}, que ya no modela un
     * tramo de regreso al almacén): si el planificador arma una ruta NUEVA para esta unidad con
     * pedidos distintos a los que llevaba, el dominio no exige una visita a almacén antes de
     * "cargarlos" -- se asume disponibilidad instantánea de inventario en la posición actual del
     * vehículo, igual que el resto del sistema asume tiempo de carga despreciable. Aceptable para
     * el alcance simplificado del curso; si se necesita modelar la recarga física entre tramos,
     * este es el punto a revisar.
     */
    private void abandonarRutasParaReplanificar(List<Ruta> rutasEnEjecucion, List<Ruta> protegidas) {
        for (Ruta ruta : rutasEnEjecucion) {
            if (protegidas.contains(ruta)) {
                continue;
            }
            ruta.setEstado(EstadoRuta.REEMPLAZADA);
            ruta.getSecuenciaParadas().stream()
                    .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA)
                    .forEach(p -> p.setEstado(EstadoParada.REASIGNADA));
            ruta.getUnidadTransporte().setEstado(EstadoUnidad.DISPONIBLE);
        }
    }

    /**
     * Re-evaluación de una ruta en curso (regla del Q&A: todo vehículo se vuelve a planificar en
     * cada iteración): sigue siendo válida si la unidad sigue operativa, existe camino transitable
     * con los bloqueos vigentes hasta cada parada pendiente, y a la velocidad ACTUAL de su tipo
     * (puede haber cambiado en caliente) llega a cada una antes de su plazo -- contando el servicio
     * de las paradas previas y el refrigerio pendiente del turno. Si algo de eso falla, la ruta se
     * abandona y sus pedidos vuelven a competir en este mismo lote.
     */
    private boolean sigueSiendoFactible(Ruta ruta, LocalDateTime ahora) {
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        if (unidad.getEstado() != EstadoUnidad.EN_RUTA) {
            return false;
        }
        var operacion = contextoProblema.configuracionOperacion();
        double velocidad = unidad.getTipoVehiculo().getVelocidadKmH();
        long servicioSeg = Math.round(operacion.tiempoServicioClienteHoras() * 3600.0);
        long refrigerioSeg = Math.round(operacion.duracionRefrigerioHoras() * 3600.0);
        LocalDateTime t = ahora;
        // Mismo criterio que MotorSimulacion: el refrigerio pendiente se toma a más tardar en su
        // último inicio permitido; uno ya en curso termina antes de seguir.
        LocalDateTime turno = operacion.inicioTurnoQueContiene(ahora);
        LocalDateTime refrigerioMasTardio = operacion.inicioRefrigerioMasTardio(turno);
        boolean refrigerioPendiente = !(turno.equals(unidad.getTiempoInicioTurnoActual()) && unidad.isRefrigerioTomado());
        if (unidad.getHoraRefrigerioProgramada() != null) {
            LocalDateTime fin = unidad.getHoraRefrigerioProgramada().plusSeconds(refrigerioSeg);
            t = fin.isAfter(t) ? fin : t;
            refrigerioPendiente = false;
        }
        Nodo posicion = unidad.getPosicion();
        for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
            if (parada.getEstado() == EstadoParada.CUMPLIDA) {
                continue;
            }
            Nodo destino = parada.getPedido().getDestino();
            if (parada.getHoraInicioServicio() != null) {
                LocalDateTime finServicio = parada.getHoraInicioServicio().plusSeconds(servicioSeg);
                t = finServicio.isAfter(t) ? finServicio : t;
                posicion = destino;
                continue;
            }
            if (refrigerioPendiente && !t.isBefore(refrigerioMasTardio)) {
                t = t.plusSeconds(refrigerioSeg);
                refrigerioPendiente = false;
            }
            double km;
            try {
                km = com.paqrap.dominio.CalculadorDistancia.distanciaKm(contextoProblema.ciudad(), todosLosBloqueos, t,
                        posicion, destino);
            } catch (IllegalStateException sinCamino) {
                return false;
            }
            LocalDateTime llegada = t.plusSeconds(Math.round(km / velocidad * 3600.0));
            // Refrigerio tomado en el camino si el viaje cruza su último inicio permitido (ver
            // MotorSimulacion.recorrerCamino).
            if (refrigerioPendiente && llegada.isAfter(refrigerioMasTardio)) {
                llegada = llegada.plusSeconds(refrigerioSeg);
                refrigerioPendiente = false;
            }
            if (llegada.isAfter(parada.getPedido().getFechaLimite())) {
                return false;
            }
            t = llegada.plusSeconds(servicioSeg);
            posicion = destino;
        }
        return true;
    }

    /**
     * Devuelve a {@code DISPONIBLE} las unidades cuya avería ya terminó. Sin esto ninguna unidad
     * salía nunca de {@code AVERIADO}: {@code estaDisponibleParaRuta} exige {@code DISPONIBLE}, y el
     * único otro punto que lo asigna (fin de ruta en MotorSimulacion) jamás corre para una unidad
     * sin ruta -- cada avería retiraba el vehículo de la flota por el resto del escenario.
     */
    private void liberarAveriasVencidas(LocalDateTime instante) {
        for (UnidadTransporte unidad : contextoProblema.vehiculos()) {
            Averia averia = unidad.getAveriaActual();
            if (unidad.getEstado() == EstadoUnidad.AVERIADO && averia != null
                    && !instante.isBefore(averia.fechaFinEstimada())) {
                unidad.setAveriaActual(null);
                unidad.setEstado(EstadoUnidad.DISPONIBLE);
                unidad.setActividadActual(com.paqrap.dominio.ActividadVehiculo.INACTIVO);
            }
        }
    }

    private void aplicarAveria(SolicitudOperacion solicitud) {
        contextoProblema.vehiculos().stream()
                .filter(u -> u.getIdUnidad().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .findFirst()
                .ifPresent(unidad -> {
                    TipoAveria tipo = TipoAveria.valueOf(solicitud.valorNuevo());
                    LocalDateTime ahora = solicitud.tiempoSimuladoProgramado();
                    LocalDateTime fin = contextoProblema.configuracionOperacion().finIndisponibilidadAveria(tipo, ahora);
                    // Si la unidad ya venía con una ruta EN_EJECUCION, la avería la abandona: se
                    // marca REEMPLAZADA y sus paradas aún no cumplidas quedan REASIGNADA, para que
                    // el pedido (que sigue PENDIENTE) vuelva a estar disponible y el próximo lote
                    // se lo ofrezca a otro vehículo -- sin esto, la ruta quedaría EN_EJECUCION para
                    // siempre y MotorSimulacion seguiría intentando avanzar un vehículo averiado.
                    Ruta rutaEnCurso = unidad.rutaEnEjecucion();
                    if (rutaEnCurso != null) {
                        rutaEnCurso.setEstado(EstadoRuta.REEMPLAZADA);
                        long liberadas = rutaEnCurso.getSecuenciaParadas().stream()
                                .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA)
                                .peek(p -> p.setEstado(EstadoParada.REASIGNADA))
                                .count();
                        motorSimulacion.registrarReplanificacion(0.0, contextoProblema, unidad.getIdUnidad(),
                                (int) liberadas, "avería " + tipo);
                    }

                    unidad.setAveriaActual(new Averia(tipo, ahora, fin, 0, ahora));
                    unidad.setEstado(EstadoUnidad.AVERIADO);
                    unidad.setActividadActual(com.paqrap.dominio.ActividadVehiculo.INACTIVO);
                    reporte.incrementarAverias();
                    motorSimulacion.registrarAveriaVehiculo(0.0, contextoProblema, unidad.getIdUnidad(),
                            unidad.getPosicion(), tipo.name());

                    // Tipo 2/3: la unidad y los paquetes no trasvasados se llevan de "manera
                    // instantánea" al almacén central (simplificación explícita del curso — no se
                    // modela tiempo de remolque). Tipo 1 permanece en el lugar de la avería.
                    if (tipo == TipoAveria.TIPO_2 || tipo == TipoAveria.TIPO_3) {
                        contextoProblema.almacenes().stream()
                                .filter(AlmacenCentral.class::isInstance)
                                .findFirst()
                                .ifPresent(central -> unidad.setPosicion(central.getPosicion()));
                    }
                });
    }

    private void aplicarCambioVelocidad(SolicitudOperacion solicitud) {
        double nuevaVelocidad = Double.parseDouble(solicitud.valorNuevo());
        contextoProblema.vehiculos().stream()
                .map(UnidadTransporte::getTipoVehiculo)
                .filter(tv -> tv.getId().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(tv -> tv.setVelocidadKmH(nuevaVelocidad));
    }

    /** {@code entidadObjetivo}: id de {@link TipoVehiculo} (p. ej. "AUTO"). {@code valorNuevo}: nueva capacidad entera. */
    private void aplicarCambioCapacidad(SolicitudOperacion solicitud) {
        int nuevaCapacidad = Integer.parseInt(solicitud.valorNuevo());
        contextoProblema.vehiculos().stream()
                .map(UnidadTransporte::getTipoVehiculo)
                .filter(tv -> tv.getId().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(tv -> tv.setCapacidad(nuevaCapacidad));
    }

    /**
     * {@code entidadObjetivo}: nombre del almacén (p. ej. "Nor-Oeste"; no aplica a "Central", que
     * tiene stock infinito y no tiene capacidad máxima que ajustar). {@code valorNuevo}: nueva
     * capacidad máxima entera.
     */
    private void aplicarCambioCapacidadAlmacen(SolicitudOperacion solicitud) {
        int nuevaCapacidad = Integer.parseInt(solicitud.valorNuevo());
        contextoProblema.almacenes().stream()
                .filter(AlmacenIntermedio.class::isInstance)
                .map(AlmacenIntermedio.class::cast)
                .filter(a -> a.getNombre().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(a -> a.setCapacidadMaxima(nuevaCapacidad));
    }

    /**
     * {@code entidadObjetivo}: nombre del almacén ("Central" o el nombre de un intermedio).
     * {@code valorNuevo}: nueva posición en formato {@code "x,y"}. Se descarta si la posición cae
     * fuera de la grilla de {@code Ciudad}: lo contrario deja un almacén en un nodo inválido y
     * {@code CalculadorDistancia} lanza {@code IllegalStateException} para toda ruta que lo toque
     * en el siguiente lote -- mismo riesgo sistémico que {@code CAMBIO_CONFIGURACION_CIUDAD}, solo
     * que localizado a un almacén en vez de a toda la ciudad.
     */
    private void aplicarCambioPosicionAlmacen(SolicitudOperacion solicitud) {
        String[] partes = solicitud.valorNuevo().split(",");
        Nodo nuevaPosicion = new Nodo(Integer.parseInt(partes[0].trim()), Integer.parseInt(partes[1].trim()));
        if (!contextoProblema.ciudad().esNodoValido(nuevaPosicion)) {
            log.warn("Posición {} fuera de los límites de la ciudad; se descarta el cambio de posición del almacén {}",
                    nuevaPosicion, solicitud.entidadObjetivo());
            return;
        }
        contextoProblema.almacenes().stream()
                .filter(a -> nombreAlmacen(a).equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(a -> a.setPosicion(nuevaPosicion));
    }

    /** Mismo criterio que {@code EnsambladorRespuestas.aAlmacenDTO}: el central no tiene nombre propio. */
    private String nombreAlmacen(Almacen almacen) {
        return almacen instanceof AlmacenIntermedio intermedio ? intermedio.getNombre() : "Central";
    }

    /**
     * {@code entidadObjetivo}: id de {@link TipoVehiculo} (p. ej. "MOTO"). {@code valorNuevo}:
     * cantidad TOTAL deseada de unidades de ese tipo (no un delta). Si aumenta, las unidades
     * nuevas arrancan en la posición de la primera unidad existente de ese tipo, disponibles
     * desde ya; si disminuye, se retiran primero las unidades ya disponibles (nunca una que esté
     * {@code EN_RUTA}, para no abandonar una entrega a mitad de camino) -- si no hay suficientes
     * disponibles para retirar, se retira lo que se pueda y se deja un warning.
     */
    private void aplicarCambioCantidadVehiculos(SolicitudOperacion solicitud) {
        int cantidadDeseada = Integer.parseInt(solicitud.valorNuevo());
        List<UnidadTransporte> actuales = contextoProblema.vehiculos();
        List<UnidadTransporte> delTipo = actuales.stream()
                .filter(u -> u.getTipoVehiculo().getId().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .toList();
        if (delTipo.isEmpty()) {
            log.warn("No existe flota del tipo {} para ajustar su cantidad", solicitud.entidadObjetivo());
            return;
        }

        TipoVehiculo tipo = delTipo.get(0).getTipoVehiculo();
        List<UnidadTransporte> nuevaLista = new ArrayList<>(actuales);
        int diferencia = cantidadDeseada - delTipo.size();

        if (diferencia > 0) {
            // Toda unidad nueva parte del almacén central (regla del caso), no de donde esté la
            // primera unidad del tipo -- esa podía ir a mitad de una ruta. Ids en formato TTNN
            // (TA11, TM16...) continuando el mayor correlativo existente.
            Nodo posicionInicial = contextoProblema.almacenes().stream()
                    .filter(AlmacenCentral.class::isInstance)
                    .findFirst()
                    .map(Almacen::getPosicion)
                    .orElseThrow();
            String prefijo = "T" + tipo.getId().charAt(0);
            int mayorCorrelativo = delTipo.stream()
                    .map(UnidadTransporte::getIdUnidad)
                    .filter(id -> id.length() > 2 && id.substring(2).chars().allMatch(Character::isDigit))
                    .mapToInt(id -> Integer.parseInt(id.substring(2)))
                    .max()
                    .orElse(0);
            for (int i = 1; i <= diferencia; i++) {
                String nuevoId = String.format("%s%02d", prefijo, mayorCorrelativo + i);
                nuevaLista.add(new UnidadTransporte(nuevoId, tipo, posicionInicial, contextoProblema.marcaTiempoActual()));
            }
        } else if (diferencia < 0) {
            List<UnidadTransporte> aRetirar = delTipo.stream()
                    .filter(u -> u.estaDisponibleParaRuta(contextoProblema.marcaTiempoActual()))
                    .limit(-diferencia)
                    .toList();
            if (aRetirar.size() < -diferencia) {
                log.warn("Se pidieron retirar {} unidades de tipo {}, pero solo {} están disponibles sin abandonar una entrega",
                        -diferencia, solicitud.entidadObjetivo(), aRetirar.size());
            }
            nuevaLista.removeAll(aRetirar);
        }

        contextoProblema = new ContextoProblema(contextoProblema.marcaTiempoActual(), contextoProblema.pedidos(),
                contextoProblema.bloqueos(), contextoProblema.mantenimientos(), contextoProblema.almacenes(),
                nuevaLista, contextoProblema.ciudad(), contextoProblema.configuracionOperacion());
    }

    /**
     * {@code entidadObjetivo}: nombre de almacén intermedio (no aplica al Central, que no tiene
     * recarga). {@code valorNuevo}: nueva frecuencia de recarga en horas.
     */
    private void aplicarCambioFrecuenciaRecarga(SolicitudOperacion solicitud) {
        double nuevaFrecuencia = Double.parseDouble(solicitud.valorNuevo());
        contextoProblema.almacenes().stream()
                .filter(AlmacenIntermedio.class::isInstance)
                .map(AlmacenIntermedio.class::cast)
                .filter(a -> a.getNombre().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(a -> a.setFrecuenciaRecargaHoras(nuevaFrecuencia));
    }

    /**
     * {@code entidadObjetivo}: nombre de un campo de {@link com.paqrap.dominio.ConfiguracionOperacion}
     * (p. ej. "duracionTurnoHoras"). {@code valorNuevo}: nuevo valor numérico. Afecta solo
     * restricciones evaluadas por {@code VerificadorRestricciones} al planificar -- a diferencia de
     * {@code CAMBIO_CONFIGURACION_CIUDAD}, no invalida posiciones ya existentes ni rompe
     * {@code CalculadorDistancia}, por eso sí se permite en caliente.
     */
    private void aplicarCambioConfiguracionOperacion(SolicitudOperacion solicitud) {
        var actual = contextoProblema.configuracionOperacion();
        double valor = Double.parseDouble(solicitud.valorNuevo());
        var nueva = switch (solicitud.entidadObjetivo()) {
            case "duracionTurnoHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(valor,
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    actual.maxParadasPorRuta());
            case "horaInicioTurno" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    valor, actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    actual.maxParadasPorRuta());
            case "tiempoServicioClienteHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), valor, actual.duracionRefrigerioHoras(), actual.margenRefrigerioHoras(),
                    actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "duracionRefrigerioHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), valor, actual.margenRefrigerioHoras(),
                    actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "margenRefrigerioHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    valor, actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "tiempoCargaAlmacenHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), valor, actual.tiempoTrasvaseHoras(), actual.maxParadasPorRuta());
            case "tiempoTrasvaseHoras" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), valor, actual.maxParadasPorRuta());
            case "maxParadasPorRuta" -> new com.paqrap.dominio.ConfiguracionOperacion(actual.duracionTurnoHoras(),
                    actual.horaInicioTurno(), actual.tiempoServicioClienteHoras(), actual.duracionRefrigerioHoras(),
                    actual.margenRefrigerioHoras(), actual.tiempoCargaAlmacenHoras(), actual.tiempoTrasvaseHoras(),
                    (int) valor);
            default -> null;
        };
        if (nueva == null) {
            log.warn("Campo de configuración de operación desconocido: {}", solicitud.entidadObjetivo());
            return;
        }
        contextoProblema = new ContextoProblema(contextoProblema.marcaTiempoActual(), contextoProblema.pedidos(),
                contextoProblema.bloqueos(), contextoProblema.mantenimientos(), contextoProblema.almacenes(),
                contextoProblema.vehiculos(), contextoProblema.ciudad(), nueva);
    }
}
