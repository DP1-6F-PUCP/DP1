package com.paqrap.simulador;

import java.time.LocalDateTime;

/** Registro de una corrida de {@link OrquestadorOperacion}: qué escenario, cuándo y en qué estado. */
public class EjecucionEscenario {

    private final String idEjecucion;
    private final TipoEscenario tipoEscenario;
    private EstadoEjecucion estado;
    private final LocalDateTime fechaInicio;
    private final LocalDateTime fechaInicioSimulada;
    // sa/k se guardan aqui (no solo en OrquestadorOperacion) para poder exponerlos via
    // EjecucionEscenarioDTO: con horasAvance=(sa/60)*k por lote repartido en sa minutos reales, la
    // razon de compresion tiempo-real:tiempo-simulado se simplifica exactamente a "k" (segundos
    // simulados por segundo real) -- el frontend los necesita para extrapolar la posicion de cada
    // vehiculo en tiempo real entre lotes, en vez de saltar solo cuando llega un lote nuevo.
    private final float sa;
    private final float k;

    public EjecucionEscenario(String idEjecucion, TipoEscenario tipoEscenario, LocalDateTime fechaInicioSimulada,
            float sa, float k) {
        this.idEjecucion = idEjecucion;
        this.tipoEscenario = tipoEscenario;
        this.fechaInicio = LocalDateTime.now();
        this.fechaInicioSimulada = fechaInicioSimulada;
        this.estado = EstadoEjecucion.INICIADA;
        this.sa = sa;
        this.k = k;
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

    public float getSa() {
        return sa;
    }

    public float getK() {
        return k;
    }
}
