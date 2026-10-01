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

    public List<Ruta> getRutas() {
        return rutas;
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
    public Ruta rutaEnEjecucion() {
        return rutas.stream()
                .filter(ruta -> ruta.getEstado() == EstadoRuta.EN_EJECUCION)
                .findFirst()
                .orElse(null);
    }

    @Override
    public String toString() {
        return idUnidad;
    }
}
