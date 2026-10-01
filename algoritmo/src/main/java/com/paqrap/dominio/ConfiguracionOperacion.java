package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * Parámetros operativos que rigen turnos, refrigerios y tiempos de servicio.
 *
 * @param duracionTurnoHoras duración de cada turno de trabajo (8 horas: 07:00, 15:00, 23:00)
 * @param horaInicioTurno hora del día (0-23) en que arranca el primer turno de referencia
 * @param tiempoServicioClienteHoras tiempo de acondicionamiento/entrega en el punto del cliente, por entrega parcial
 * @param duracionRefrigerioHoras duración obligatoria del refrigerio dentro de un turno
 * @param margenRefrigerioHoras margen mínimo antes/después de un cambio de turno para tomar el refrigerio
 * @param tiempoCargaAlmacenHoras tiempo de carga del almacén a la unidad de transporte
 * @param tiempoTrasvaseHoras tiempo de transferencia de paquetes entre unidades de transporte
 * @param maxParadasPorRuta tope de paradas que un vehículo puede llevar en un solo despacho antes
 *         de volver a estar disponible para uno nuevo -- desviación deliberada del diagrama
 *         canónico (campo nuevo), agregada porque empaquetar a capacidad completa (ej. 7 paradas
 *         en un auto) combinado con 1h de servicio obligatorio por parada puede inmovilizar un
 *         vehículo la mayor parte de su turno en un solo viaje, saturando la flota; confirmado
 *         empíricamente antes de este cambio (ver hallazgo de "empaquetado a capacidad completa")
 */
public record ConfiguracionOperacion(
        double duracionTurnoHoras,
        double horaInicioTurno,
        double tiempoServicioClienteHoras,
        double duracionRefrigerioHoras,
        double margenRefrigerioHoras,
        double tiempoCargaAlmacenHoras,
        double tiempoTrasvaseHoras,
        int maxParadasPorRuta) {

    /**
     * Calcula el inicio del turno que contiene el instante dado.
     *
     * @param instante momento a evaluar
     * @return fecha-hora de inicio del turno vigente en {@code instante}
     */
    public LocalDateTime inicioTurnoQueContiene(LocalDateTime instante) {
        LocalDateTime referencia = instante.toLocalDate()
                .atTime(LocalTime.of((int) horaInicioTurno, 0));
        long horasDesdeReferencia = java.time.Duration.between(referencia, instante).toMinutes() / 60;
        if (horasDesdeReferencia < 0) {
            horasDesdeReferencia -= (long) duracionTurnoHoras;
        }
        long turnosCompletos = Math.floorDiv(horasDesdeReferencia, (long) duracionTurnoHoras);
        return referencia.plusHours(turnosCompletos * (long) duracionTurnoHoras);
    }
}
