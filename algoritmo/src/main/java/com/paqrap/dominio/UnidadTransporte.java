package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Vehículo (auto, moto o bicicleta) de la flota de PaqRap. */
public class UnidadTransporte {

    private final String idUnidad;
    private EstadoUnidad estado;
    private Nodo posicion;
    private Nodo nodoAnteriorRecorrido;
    private final TipoVehiculo tipoVehiculo;
    private Averia averiaActual;
    // rutas nunca se recorta -- acumula TODO el historial de despachos de la unidad durante la
    // vida del escenario (confirmado: no hay ningun remove()/clear() sobre ella en todo el
    // codigo). Por eso NO puede ser CopyOnWriteArrayList (cada add() copiaria el arreglo entero,
    // O(n) por lote y O(n^2) acumulado a lo largo de un escenario largo -- probado: causo un
    // colapso real de rendimiento, de milisegundos a minutos por lote, tras ~1700 lotes en una
    // corrida de 17 dias simulados). En su lugar, acceso encapsulado y sincronizado: mutacion
    // O(1) vía agregarRuta(), lectura vía getRutas()/rutaEnEjecucion() sincronizada sobre copia
    // defensiva -- evita el ConcurrentModificationException original sin pagar el costo de
    // CopyOnWriteArrayList.
    private final List<Ruta> rutas = new ArrayList<>();
    private LocalDateTime tiempoInicioTurnoActual;
    private LocalDateTime horaRefrigerioProgramada;
    private boolean refrigerioTomado;
    // No persiste historial, solo el ultimo valor conocido -- lo actualiza MotorSimulacion en cada
    // lote segun en que fase termino la simulacion de este vehiculo (ver ActividadVehiculo).
    private ActividadVehiculo actividadActual = ActividadVehiculo.INACTIVO;

    /**
     * Un punto del recorrido real de la unidad: desde {@code instante} y hasta el punto siguiente,
     * la unidad hace {@code actividad} (si el punto siguiente está en otro nodo, viaja hacia él).
     */
    public record PuntoTrayectoria(Nodo nodo, LocalDateTime instante, ActividadVehiculo actividad, boolean retorno,
            int cargaABordo) {
        public PuntoTrayectoria(Nodo nodo, LocalDateTime instante, ActividadVehiculo actividad) {
            this(nodo, instante, actividad, false, 0);
        }
    }

    /**
     * true mientras la unidad viaja hacia un almacén sin estar repartiendo: regreso tras sus
     * entregas, o camino a cargar para una ruta nueva. Se graba en cada punto de la trayectoria
     * para que el mapa la pinte gris exactamente hasta que llega al almacén (antes lo decidía con el
     * estado del FINAL del lote, y el color cambiaba varias cuadras antes de llegar).
     */
    private boolean enRetorno;

    public synchronized boolean isEnRetorno() {
        return enRetorno;
    }

    /**
     * Cambia el modo y marca un punto en {@code nodo} (donde está la unidad en ese instante de la
     * simulación: {@code posicion} solo se actualiza al cerrar el lote), así el tramo que empieza
     * ahí ya lleva el modo nuevo.
     */
    public synchronized void setEnRetorno(boolean enRetorno, Nodo nodo, LocalDateTime instante) {
        if (this.enRetorno == enRetorno) {
            return;
        }
        this.enRetorno = enRetorno;
        if (nodo != null && instante != null) {
            registrarPuntoTrayectoria(nodo, instante, actividadActual);
        }
    }

    /**
     * Recorrido real del ÚLTIMO lote simulado (se reinicia al empezar cada lote): cada nodo por el
     * que pasó, con su instante simulado, más los puntos donde empezó/terminó una pausa (entrega,
     * refrigerio). Lo consume el visualizador para reproducir exactamente lo que simuló el backend
     * -- antes solo recibía la posición final del lote y tenía que adivinar el camino y los
     * tiempos (con la replanificación por lote, a menudo se equivocaba: diagonales, vehículos
     * "moviéndose" mientras entregaban, paradas intermedias invisibles).
     */
    private final List<PuntoTrayectoria> trayectoriaLote = new ArrayList<>();

    /**
     * Paquetes que quedaron a bordo cuando la unidad se averió (uno por pedido no entregado). Mientras
     * la unidad siga averiada en el sitio funciona como un "almacén móvil": otra unidad puede ir a
     * recogerlos (trasvase). Se vacía cuando se trasladan al almacén central (avería 2/3), cuando la
     * unidad se repara (avería 1) o a medida que se trasvasan o se reasignan a otra unidad.
     */
    private final List<ParadaPlanificada> cargaVarada = new ArrayList<>();

    /**
     * Instante real en que la unidad llega a su posición actual cuando el lote anterior cerró a mitad
     * de una cuadra: la cuadra se termina a su velocidad normal y el lote siguiente no puede mover
     * esta unidad antes de ese instante (antes la cuadra se "terminaba" al cierre del lote, a veces en
     * segundos: medido, 3x la velocidad nominal en mediana y hasta 24x).
     */
    private LocalDateTime disponibleDesde;

    public synchronized LocalDateTime getDisponibleDesde() {
        return disponibleDesde;
    }

    public synchronized void setDisponibleDesde(LocalDateTime disponibleDesde) {
        this.disponibleDesde = disponibleDesde;
    }

    public synchronized List<ParadaPlanificada> getCargaVarada() {
        return new ArrayList<>(cargaVarada);
    }

    public synchronized void agregarCargaVarada(Pedido pedido, int cantidad) {
        cargaVarada.removeIf(p -> p.getPedido().equals(pedido));
        cargaVarada.add(new ParadaPlanificada(pedido, cantidad));
    }

    public synchronized void quitarCargaVarada(Pedido pedido) {
        cargaVarada.removeIf(p -> p.getPedido().equals(pedido));
    }

    public synchronized void vaciarCargaVarada() {
        cargaVarada.clear();
    }

    public synchronized void iniciarTrayectoria(LocalDateTime instante) {
        trayectoriaLote.clear();
        // Si todavía termina la cuadra del lote anterior, el primer punto es su llegada real.
        LocalDateTime desde = disponibleDesde != null && disponibleDesde.isAfter(instante) ? disponibleDesde : instante;
        trayectoriaLote.add(new PuntoTrayectoria(posicion, desde, actividadActual, enRetorno, cargaABordo));
    }

    public synchronized void registrarPuntoTrayectoria(Nodo nodo, LocalDateTime instante, ActividadVehiculo actividad) {
        if (!trayectoriaLote.isEmpty()) {
            PuntoTrayectoria ultimo = trayectoriaLote.get(trayectoriaLote.size() - 1);
            if (!ultimo.nodo().equals(nodo)) nodoAnteriorRecorrido = ultimo.nodo();
            if (instante.isBefore(ultimo.instante())) {
                instante = ultimo.instante(); // nunca hacia atrás en el tiempo
            }
            if (ultimo.nodo().equals(nodo) && ultimo.instante().equals(instante) && ultimo.actividad() == actividad
                    && ultimo.retorno() == enRetorno && ultimo.cargaABordo() == cargaABordo) {
                return;
            }
        }
        trayectoriaLote.add(new PuntoTrayectoria(nodo, instante, actividad, enRetorno, cargaABordo));
    }

    public synchronized List<PuntoTrayectoria> getTrayectoriaLote() {
        return List.copyOf(trayectoriaLote);
    }

    public UnidadTransporte(String idUnidad, TipoVehiculo tipoVehiculo, Nodo posicion,
            LocalDateTime tiempoInicioTurnoActual) {
        this.idUnidad = idUnidad;
        this.tipoVehiculo = tipoVehiculo;
        this.posicion = posicion;
        this.tiempoInicioTurnoActual = tiempoInicioTurnoActual;
        this.estado = EstadoUnidad.DISPONIBLE;
    }

    public String getIdUnidad() {
        return idUnidad;
    }

    public EstadoUnidad getEstado() {
        return estado;
    }

    public void setEstado(EstadoUnidad estado) {
        this.estado = estado;
    }

    public Nodo getPosicion() {
        return posicion;
    }

    public Nodo getNodoAnteriorRecorrido() {
        return nodoAnteriorRecorrido;
    }

    public void setPosicion(Nodo posicion) {
        this.posicion = posicion;
    }

    public TipoVehiculo getTipoVehiculo() {
        return tipoVehiculo;
    }

    public Averia getAveriaActual() {
        return averiaActual;
    }

    public void setAveriaActual(Averia averiaActual) {
        this.averiaActual = averiaActual;
    }

    /** Copia defensiva del historial de rutas -- ver nota sobre {@code rutas} en los campos. */
    public synchronized List<Ruta> getRutas() {
        return new ArrayList<>(rutas);
    }

    /** Único punto de escritura de {@code rutas}; reemplaza el antiguo {@code getRutas().add(...)}. */
    public synchronized void agregarRuta(Ruta ruta) {
        rutas.add(ruta);
        // Solo se usa la última (rutaEnEjecucion). Antes se guardaban TODAS -- incluida la ruta vacía
        // que el planificador crea para cada unidad libre en cada lote --, decenas de miles por 5 días
        // y sin límite en un colapso largo, cada una reteniendo sus paradas y pedidos. Nada las leía:
        // el historial por almacén/pedido sale de los propios pedidos (nodo y hora de despacho).
        while (rutas.size() > RUTAS_CONSERVADAS) {
            rutas.remove(0);
        }
    }

    private static final int RUTAS_CONSERVADAS = 2;

    public LocalDateTime getTiempoInicioTurnoActual() {
        return tiempoInicioTurnoActual;
    }

    public void setTiempoInicioTurnoActual(LocalDateTime tiempoInicioTurnoActual) {
        this.tiempoInicioTurnoActual = tiempoInicioTurnoActual;
    }

    public LocalDateTime getHoraRefrigerioProgramada() {
        return horaRefrigerioProgramada;
    }

    public void setHoraRefrigerioProgramada(LocalDateTime horaRefrigerioProgramada) {
        this.horaRefrigerioProgramada = horaRefrigerioProgramada;
    }

    public boolean isRefrigerioTomado() {
        return refrigerioTomado;
    }

    public void setRefrigerioTomado(boolean refrigerioTomado) {
        this.refrigerioTomado = refrigerioTomado;
    }

    /**
     * Devuelve la unidad al estado de arranque de un escenario nuevo. La flota es estado compartido
     * entre ejecuciones, así que sin esto una ejecución detenida a mitad de camino dejaba su última
     * ruta {@code EN_EJECUCION}, su avería y su refrigerio vivos para la siguiente.
     */
    public synchronized void reiniciarParaNuevaEjecucion(Nodo posicionInicial, LocalDateTime inicioTurno) {
        this.posicion = posicionInicial;
        this.nodoAnteriorRecorrido = null;
        this.estado = EstadoUnidad.DISPONIBLE;
        this.averiaActual = null;
        this.rutas.clear();
        this.tiempoInicioTurnoActual = inicioTurno;
        this.horaRefrigerioProgramada = null;
        this.refrigerioTomado = false;
        this.actividadActual = ActividadVehiculo.INACTIVO;
        this.trayectoriaLote.clear();
        this.cargaVarada.clear();
        this.disponibleDesde = null;
        this.cargaABordo = 0;
        this.enRetorno = false;
        this.salidaAlmacen = null;
        this.salidaAlmacenAnterior = null;
    }

    /**
     * Últimas dos salidas de un almacén (no cuentan los despachos desde la calle con carga a bordo).
     * Se guardan dos porque el lote se publica adelantado al reloj que muestra el mapa: si la última
     * salida aún no llegó en ese reloj, vale la anterior. Regla del profesor: solo se averían
     * vehículos que salieron del almacén hace menos de 4 h.
     */
    private LocalDateTime salidaAlmacen;
    private LocalDateTime salidaAlmacenAnterior;

    public synchronized void registrarSalidaAlmacen(LocalDateTime instante) {
        if (instante == null || instante.equals(salidaAlmacen)) {
            return;
        }
        this.salidaAlmacenAnterior = this.salidaAlmacen;
        this.salidaAlmacen = instante;
    }

    public synchronized LocalDateTime getSalidaAlmacen() {
        return salidaAlmacen;
    }

    public synchronized LocalDateTime getSalidaAlmacenAnterior() {
        return salidaAlmacenAnterior;
    }

    /**
     * Paquetes de producto P que lleva físicamente la unidad. El producto es uno solo, así que lo
     * que sobra de una ruta abandonada (replanificación) sirve para cualquier otro cliente: la
     * unidad solo vuelve a un almacén a cargar si la ruta nueva necesita más de lo que ya lleva.
     * Se fija al salir de un almacén, baja con cada entrega y vuelve a 0 al llegar a un almacén.
     */
    private int cargaABordo;

    public synchronized int getCargaABordo() {
        return cargaABordo;
    }

    public synchronized void setCargaABordo(int cargaABordo) {
        this.cargaABordo = Math.max(0, cargaABordo);
    }

    public ActividadVehiculo getActividadActual() {
        return actividadActual;
    }

    public void setActividadActual(ActividadVehiculo actividadActual) {
        this.actividadActual = actividadActual;
    }

    /**
     * Paquetes que la unidad lleva físicamente ahora (lo que muestra el mapa como ocupación).
     *
     * @return con ruta en ejecución, lo que falta entregar de ella; sin ruta, la carga varada (una
     *         avería abandona la ruta, pero los paquetes siguen a bordo hasta un trasvase o el
     *         traslado al central) o lo que le sobró a bordo de una ruta replanificada
     */
    public int cargaActual() {
        Ruta enEjecucion = rutaEnEjecucion();
        if (enEjecucion == null) {
            // Antes devolvía 0: al registrar una avería la ocupación caía a 0 en el acto aunque
            // los paquetes siguieran en el vehículo detenido.
            int varada = getCargaVarada().stream().mapToInt(ParadaPlanificada::getCantidadAEntregar).sum();
            return varada > 0 ? varada : getCargaABordo();
        }
        if (enEjecucion.tieneCargaPendiente() || enEjecucion.tieneTrasvasePendiente()) {
            // Camino al almacén a cargar, o a recoger la carga de una averiada: solo lo que ya llevaba.
            return getCargaABordo();
        }
        return enEjecucion.getSecuenciaParadas().stream()
                .filter(parada -> parada.getEstado() != EstadoParada.CUMPLIDA)
                .mapToInt(ParadaPlanificada::getCantidadAEntregar)
                .sum();
    }

    /**
     * Determina si la unidad puede recibir una NUEVA asignación de ruta en el instante dado. Una
     * unidad {@code EN_RUTA} (con una ruta {@code EN_EJECUCION} sin terminar) NO cuenta como
     * disponible -- debe completar esa ruta antes de recibir otra; de lo contrario el
     * planificador podría reasignarla a mitad de camino cada lote, sin terminar nunca ninguna
     * entrega (bug real confirmado empíricamente antes de este fix).
     *
     * @param instante momento a evaluar
     * @return {@code true} si la unidad está {@code DISPONIBLE} y no tiene una avería activa
     */
    public boolean estaDisponibleParaRuta(LocalDateTime instante) {
        if (estado != EstadoUnidad.DISPONIBLE) {
            return false;
        }
        return averiaActual == null || instante.isAfter(averiaActual.fechaFinEstimada());
    }

    /**
     * Obtiene la ruta actualmente en ejecución de esta unidad, si existe.
     *
     * @return la {@link Ruta} con estado {@code EN_EJECUCION}, o {@code null} si no hay ninguna
     */
    /**
     * O(1), no O(n) sobre todo el historial: una ruta nueva solo se agrega cuando la unidad está
     * {@link #estaDisponibleParaRuta}, es decir, cuando la anterior (si existía) ya quedó en
     * estado terminal -- así que la única ruta que puede seguir {@code EN_EJECUCION} es siempre la
     * última agregada. Antes de este fix, esta función escaneaba TODO el historial acumulado de
     * la unidad en cada llamada (una vez por vehículo por lote) -- confirmado como la causa real
     * de un colapso de rendimiento (de milisegundos a minutos por lote) en una corrida larga,
     * donde el historial de rutas de un vehículo activo crece sin límite durante la vida del
     * escenario.
     */
    public synchronized Ruta rutaEnEjecucion() {
        if (rutas.isEmpty()) {
            return null;
        }
        Ruta ultima = rutas.get(rutas.size() - 1);
        return ultima.getEstado() == EstadoRuta.EN_EJECUCION ? ultima : null;
    }

    @Override
    public String toString() {
        return idUnidad;
    }
}
