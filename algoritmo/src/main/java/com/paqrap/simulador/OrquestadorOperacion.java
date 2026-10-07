package com.paqrap.simulador;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Averia;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
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
    /** Pedidos recién cargados de un archivo oficial, pendientes de incorporarse al próximo lote. */
    private final List<Pedido> pedidosPorIncorporar = new ArrayList<>();

    private final Planificador planificador;
    private final MotorSimulacion motorSimulacion;
    private final ReporteDesempeno reporte = new ReporteDesempeno();
    private final Random randomEscenario = new Random(42);

    private TipoEscenario tipoEscenario;
    private EjecucionEscenario ejecucionActual;
    private ScheduledExecutorService programador;
    private volatile boolean detenido = true;
    private volatile boolean pausado = false;
    private int contadorPedidosSinteticos = 0;

    private volatile List<Ruta> ultimasRutas = List.of();
    private volatile List<com.paqrap.simulador.EventoSimulacion> ultimosEventos = List.of();
    private volatile LocalDateTime anclaUltimoLote;

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
        this.tipoEscenario = tipoEscenario;
        this.ejecucionActual = new EjecucionEscenario(UUID.randomUUID().toString(), tipoEscenario,
                contextoProblema.marcaTiempoActual(), sa, k);
        this.ejecucionActual.iniciar();
        this.detenido = false;

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
        asegurarDatosOficialesCargados(contextoProblema.marcaTiempoActual());
        long tDespuesCarga = System.currentTimeMillis();
        aplicarSolicitudesVencidas();
        aplicarMantenimientos(contextoProblema.marcaTiempoActual());
        long tDespuesSolicitudes = System.currentTimeMillis();

        // Rutas que ya venían EN_EJECUCION de un lote anterior (sin terminar todas sus paradas):
        // se retoman tal cual, NO se vuelven a planificar. UnidadTransporte.estaDisponibleParaRuta
        // ya excluye estos vehículos de una nueva asignación, y MotorSimulacion.simularUnaRuta
        // continúa cada una desde la parada pendiente -- antes de este fix, cada lote rehacía todo
        // desde cero según la posición actual del vehículo, así que un viaje nunca alcanzaba a
        // completarse si tomaba más de un lote (confirmado empíricamente: 0 entregas en 4+ horas
        // simuladas con miles de pedidos pendientes).
        List<Ruta> rutasEnCurso = contextoProblema.vehiculos().stream()
                .map(UnidadTransporte::rutaEnEjecucion)
                .filter(java.util.Objects::nonNull)
                .toList();
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

        // Al planificador solo se le ofrecen los pedidos SIN compromiso todavía -- los que ya van
        // camino a entregarse en una ruta en curso no se le vuelven a ofrecer (evita que se le
        // asignen a otro vehículo mientras el primero ya viene en camino).
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
        List<Pedido> noAsignados = pedidosNoAsignados(todasLasRutas, pedidosDelLote);
        anclaUltimoLote = contextoProblema.marcaTiempoActual();
        long tAntesSimular = System.currentTimeMillis();
        ultimosEventos = motorSimulacion.simularRutas(todasLasRutas, noAsignados, contextoDelLote, 0.0, horasAvance);
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

        recargarAlmacenesSiCorrespondeMedianoche(instanteAnterior, nuevoInstante);

        List<Pedido> pedidosVigentes = actualizarEstadosYFiltrarPendientes(pedidosDelLote, nuevoInstante);
        pedidosVigentes.addAll(generarPedidosSinteticos(nuevoInstante));
        long tFinLote = System.currentTimeMillis();
        // Desglose completo del lote -- ver el comentario de tInicioLote. "simular" es
        // MotorSimulacion.simularRutas (recorre TODAS las rutas en_curso+nuevas, llama
        // CalculadorDistancia por cada tramo -- la sospecha principal con rutasEnCurso creciendo
        // sin tope en escenarios largos); "cierre" cubre recarga de almacenes + estados de pedidos
        // + demanda sintetica (esta ultima crece con contadorPedidosSinteticos en COLAPSO_LOGISTICO).
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
            return;
        }

        ejecucionActual.setEstado(EstadoEjecucion.EN_CURSO);
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

    private List<Pedido> actualizarEstadosYFiltrarPendientes(List<Pedido> pedidos, LocalDateTime nuevoInstante) {
        List<Pedido> vigentes = new ArrayList<>();
        for (Pedido pedido : pedidos) {
            pedido.actualizarEstado(nuevoInstante);
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
     * Genera demanda sintética según el escenario en curso. {@code DIA_A_DIA} no genera pedidos
     * sintéticos (se asume que llegan de una fuente externa ya reflejada en el contexto);
     * {@code CINCO_DIAS} genera una cantidad moderada y constante por ciclo;
     * {@code COLAPSO_LOGISTICO} incrementa progresivamente la cantidad por ciclo para encontrar el
     * punto de quiebre — esta lógica reemplaza a los antiguos {@code SimuladorCincoDias} y
     * {@code SimuladorColapsoLogistico}, que no correspondían al diagrama canónico (vivían
     * indebidamente acoplados a ALNS en vez de al orquestador, agnóstico al algoritmo).
     */
    private List<Pedido> generarPedidosSinteticos(LocalDateTime instante) {
        if (tipoEscenario == null || tipoEscenario == TipoEscenario.DIA_A_DIA) {
            return new ArrayList<>();
        }

        int cantidad = switch (tipoEscenario) {
            case CINCO_DIAS -> 10;
            case COLAPSO_LOGISTICO -> 10 + (contadorPedidosSinteticos / 5);
            default -> 0;
        };

        Ciudad ciudad = contextoProblema.ciudad();
        int[] slas = {4, 8, 12, 18, 36};
        List<Pedido> generados = new ArrayList<>();
        for (int i = 0; i < cantidad; i++) {
            int x = randomEscenario.nextInt(ciudad.ancho() + 1);
            int y = randomEscenario.nextInt(ciudad.alto() + 1);
            int cantidadProducto = 1 + randomEscenario.nextInt(3);
            int sla = slas[randomEscenario.nextInt(slas.length)];
            String id = "SINT-" + (++contadorPedidosSinteticos);
            Pedido pedidoSintetico = new Pedido(id, "cliente-" + id, new Nodo(x, y), cantidadProducto, sla, instante);
            generados.add(pedidoSintetico);
            double tiempoHoras = java.time.Duration.between(contextoProblema.marcaTiempoActual(), instante)
                    .toSeconds() / 3600.0;
            motorSimulacion.registrarNuevoPedido(tiempoHoras, contextoProblema, pedidoSintetico);
        }
        return generados;
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
        for (Mantenimiento mantenimiento : contextoProblema.mantenimientos()) {
            UnidadTransporte unidad = mantenimiento.vehiculoAfectado();
            boolean dentroDeVentana = !instante.isBefore(mantenimiento.fechaInicio())
                    && instante.isBefore(mantenimiento.fechaFinCalculada());
            if (dentroDeVentana && unidad.getEstado() != EstadoUnidad.AVERIADO) {
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
            } else if (!dentroDeVentana && unidad.getEstado() == EstadoUnidad.EN_MANTENIMIENTO) {
                unidad.setEstado(EstadoUnidad.DISPONIBLE);
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
                    LocalDateTime fin = switch (tipo) {
                        case TIPO_1 -> ahora.plusHours(2);
                        case TIPO_2 -> ahora.plusHours(4);
                        case TIPO_3 -> ahora.plusDays(2);
                    };
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
            Nodo posicionInicial = delTipo.get(0).getPosicion();
            int siguienteCorrelativo = delTipo.size() + 1;
            for (int i = 0; i < diferencia; i++) {
                String nuevoId = tipo.getId() + "-" + (siguienteCorrelativo + i);
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
