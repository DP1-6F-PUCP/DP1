package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Vehículo (auto, moto o bicicleta) de la flota de PaqRap. */
public class UnidadTransporte {

    private final String idUnidad;
    private EstadoUnidad estado;
    private Nodo posicion;
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
    }

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
     * Calcula la carga actualmente comprometida en la ruta en ejecución.
     *
     * @return suma de las cantidades a entregar de las paradas aún no cumplidas de la ruta activa;
     *         cero si no hay ruta en ejecución
     */
    public int cargaActual() {
        Ruta enEjecucion = rutaEnEjecucion();
        if (enEjecucion == null) {
            return 0;
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
