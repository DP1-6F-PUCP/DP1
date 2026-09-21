package com.paqrap.simulador;

import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Averia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoAveria;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
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

    private final float sa;
    private final float ta;
    private final float k;
    private final float tiempoMaximoComputoSegundos;
    private volatile ContextoProblema contextoProblema;
    private final List<SolicitudOperacion> solicitudesPendientes = new CopyOnWriteArrayList<>();

    private final Planificador planificador;
    private final MotorSimulacion motorSimulacion;
    private final ReporteDesempeno reporte = new ReporteDesempeno();
    private final Random randomEscenario = new Random(42);

    private TipoEscenario tipoEscenario;
    private EjecucionEscenario ejecucionActual;
    private ScheduledExecutorService programador;
    private volatile boolean detenido = true;
    private int contadorPedidosSinteticos = 0;

    private volatile List<Ruta> ultimasRutas = List.of();
    private volatile List<com.paqrap.simulador.EventoSimulacion> ultimosEventos = List.of();
    private volatile LocalDateTime anclaUltimoLote;

    public OrquestadorOperacion(Planificador planificador, GestorLogSimulacion gestorLog, float sa, float ta,
            float k, float tiempoMaximoComputoSegundos, ContextoProblema contextoInicial) {
        this.planificador = planificador;
        this.motorSimulacion = new MotorSimulacion(gestorLog);
        this.sa = sa;
        this.ta = ta;
        this.k = k;
        this.tiempoMaximoComputoSegundos = tiempoMaximoComputoSegundos;
        this.contextoProblema = contextoInicial;
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
                contextoProblema.marcaTiempoActual());
        this.ejecucionActual.iniciar();
        this.detenido = false;

        this.programador = Executors.newSingleThreadScheduledExecutor();
        long periodoMs = Math.round(sa * 60_000.0);
        programador.scheduleAtFixedRate(this::ejecutarSiguienteLote, 0, periodoMs, TimeUnit.MILLISECONDS);
        return ejecucionActual;
    }

    /**
     * Ejecuta un ciclo: aplica solicitudes vencidas, invoca al planificador, simula el avance de
     * {@code sa * k} minutos de tiempo simulado y actualiza el contexto y el reporte de
     * desempeño. Se detiene automáticamente si detecta un pedido incumplido (falla dura: la
     * política de entrega a tiempo es irrenunciable).
     */
    public void ejecutarSiguienteLote() {
        if (detenido) {
            return;
        }

        aplicarSolicitudesVencidas();

        long inicioMs = System.currentTimeMillis();
        List<Ruta> rutas = planificador.planificarRutas(contextoProblema);
        double segundosComputo = (System.currentTimeMillis() - inicioMs) / 1000.0;
        if (segundosComputo > tiempoMaximoComputoSegundos) {
            System.err.printf(
                    "[OrquestadorOperacion] ALERTA: la planificación tomó %.2fs, supera el presupuesto de %.2fs%n",
                    segundosComputo, tiempoMaximoComputoSegundos);
        }

        double horasAvance = (sa / 60.0) * k;
        List<Pedido> noAsignados = pedidosNoAsignados(rutas, contextoProblema.pedidos());
        anclaUltimoLote = contextoProblema.marcaTiempoActual();
        ultimosEventos = motorSimulacion.simularRutas(rutas, noAsignados, contextoProblema, 0.0, horasAvance);
        ultimasRutas = rutas;

        for (Ruta ruta : rutas) {
            reporte.sumarCosto(ruta.getCostoEstimado());
        }
        reporte.incrementarEntregados(motorSimulacion.getPedidosCompletados().size());

        LocalDateTime instanteAnterior = contextoProblema.marcaTiempoActual();
        LocalDateTime nuevoInstante = instanteAnterior.plusSeconds(Math.round(horasAvance * 3600.0));

        recargarAlmacenesSiCorrespondeMedianoche(instanteAnterior, nuevoInstante);

        List<Pedido> pedidosVigentes = actualizarEstadosYFiltrarPendientes(contextoProblema.pedidos(), nuevoInstante);
        pedidosVigentes.addAll(generarPedidosSinteticos(nuevoInstante));

        contextoProblema = new ContextoProblema(nuevoInstante, pedidosVigentes, contextoProblema.bloqueos(),
                contextoProblema.mantenimientos(), contextoProblema.almacenes(), contextoProblema.vehiculos(),
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

    private void recargarAlmacenesSiCorrespondeMedianoche(LocalDateTime desde, LocalDateTime hasta) {
        LocalDate diaDesde = desde.toLocalDate();
        LocalDate diaHasta = hasta.toLocalDate();
        if (diaHasta.isAfter(diaDesde)) {
            for (var almacen : contextoProblema.almacenes()) {
                if (almacen instanceof AlmacenIntermedio intermedio) {
                    intermedio.recargar();
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
            generados.add(new Pedido(id, "cliente-" + id, new Nodo(x, y), cantidadProducto, sla, instante));
        }
        return generados;
    }

    /**
     * Aplica las solicitudes cuyo {@code tiempoSimuladoProgramado} ya se alcanzó. Implementados:
     * {@code AVERIA} y {@code CAMBIO_VELOCIDAD} (los dos casos con regla de negocio confirmada —
     * averías registradas en caliente, cambio de velocidad por tipo de vehículo). El resto de
     * {@link TipoSolicitud} quedan como extensión pendiente, documentada explícitamente en vez de
     * ignorada en silencio.
     */
    private void aplicarSolicitudesVencidas() {
        LocalDateTime ahora = contextoProblema.marcaTiempoActual();
        List<SolicitudOperacion> vencidas = solicitudesPendientes.stream()
                .filter(s -> !s.tiempoSimuladoProgramado().isAfter(ahora))
                .toList();

        for (SolicitudOperacion solicitud : vencidas) {
            switch (solicitud.tipoSolicitud()) {
                case AVERIA -> aplicarAveria(solicitud);
                case CAMBIO_VELOCIDAD -> aplicarCambioVelocidad(solicitud);
                default -> System.err.println(
                        "[OrquestadorOperacion] Tipo de solicitud aún no implementado: " + solicitud.tipoSolicitud());
            }
            solicitudesPendientes.remove(solicitud);
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
                    unidad.setAveriaActual(new Averia(tipo, ahora, fin, 0, ahora));
                    unidad.setEstado(EstadoUnidad.AVERIADO);
                    reporte.incrementarAverias();
                });
    }

    private void aplicarCambioVelocidad(SolicitudOperacion solicitud) {
        double nuevaVelocidad = Double.parseDouble(solicitud.valorNuevo());
        contextoProblema.vehiculos().stream()
                .map(UnidadTransporte::getTipoVehiculo)
                .filter(tv -> tv.getId().equalsIgnoreCase(solicitud.entidadObjetivo()))
                .forEach(tv -> tv.setVelocidadKmH(nuevaVelocidad));
    }
}
