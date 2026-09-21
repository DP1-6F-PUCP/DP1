package com.paqrap.simulador;

import java.time.LocalDateTime;

/** Registro de una corrida de {@link OrquestadorOperacion}: qué escenario, cuándo y en qué estado. */
public class EjecucionEscenario {

    private final String idEjecucion;
    private final TipoEscenario tipoEscenario;
    private EstadoEjecucion estado;
    private final LocalDateTime fechaInicio;
    private final LocalDateTime fechaInicioSimulada;

    public EjecucionEscenario(String idEjecucion, TipoEscenario tipoEscenario, LocalDateTime fechaInicioSimulada) {
        this.idEjecucion = idEjecucion;
        this.tipoEscenario = tipoEscenario;
        this.fechaInicio = LocalDateTime.now();
        this.fechaInicioSimulada = fechaInicioSimulada;
        this.estado = EstadoEjecucion.INICIADA;
    }

    /** Marca el inicio formal de la ejecución (transición a {@link EstadoEjecucion#EN_CURSO}). */
    public void iniciar() {
        this.estado = EstadoEjecucion.EN_CURSO;
    }

    public String getIdEjecucion() {
        return idEjecucion;
    }

    public TipoEscenario getTipoEscenario() {
        return tipoEscenario;
    }

    public EstadoEjecucion getEstado() {
        return estado;
    }

    public void setEstado(EstadoEjecucion estado) {
        this.estado = estado;
    }

    public LocalDateTime getFechaInicio() {
        return fechaInicio;
    }

    public LocalDateTime getFechaInicioSimulada() {
        return fechaInicioSimulada;
    }
}
