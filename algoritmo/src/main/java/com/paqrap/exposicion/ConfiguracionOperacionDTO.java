package com.paqrap.exposicion;

/** Representación de {@link com.paqrap.dominio.ConfiguracionOperacion} para el visualizador. */
public record ConfiguracionOperacionDTO(float duracionTurnoHoras, float horaInicioTurno,
        float tiempoServicioClienteHoras, float duracionRefrigerioHoras, float tiempoTrasvaseHoras,
        float margenRefrigerioHoras, float tiempoCargaAlmacenHoras) {
}
