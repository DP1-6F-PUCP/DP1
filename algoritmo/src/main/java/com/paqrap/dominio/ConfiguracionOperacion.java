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
        // Bug real corregido (reporte directo, con captura: los 37 vehiculos de una flota entera
        // aparecian apilados en el almacen central, todos EN_REFRIGERIO desde el primer lote --
        // nunca llegaban a despachar). Causa: para cualquier instante ANTES de horaInicioTurno
        // (p. ej. medianoche, con horaInicioTurno=7), la correccion manual de abajo ("si es
        // negativo, restar otro duracionTurnoHoras ANTES de floorDiv") se restaba DOS VECES -- una
        // vez a mano, otra implicita dentro del propio floorDiv (que YA maneja negativos
        // correctamente por su cuenta, sin ayuda) -- empujando el turno calculado 2 turnos
        // completos (16h con duracionTurnoHoras=8) antes de lo real. Eso dejaba
        // tiempoInicioRefrigerio (en MotorSimulacion, turnoActual + duracionTurnoHoras/2) ya en el
        // PASADO desde el primer instante de cualquier lote, asi que el refrigerio obligatorio se
        // disparaba de inmediato, antes de que el vehiculo alcanzara a moverse. floorDiv sobre
        // MINUTOS (en vez de horas pre-ajustadas a mano) basta solo, sin el ajuste manual.
        LocalDateTime referencia = instante.toLocalDate()
                .atTime(LocalTime.of((int) horaInicioTurno, 0));
        long minutosDesdeReferencia = java.time.Duration.between(referencia, instante).toMinutes();
        long minutosPorTurno = Math.round(duracionTurnoHoras * 60);
        long turnosCompletos = Math.floorDiv(minutosDesdeReferencia, minutosPorTurno);
        return referencia.plusMinutes(turnosCompletos * minutosPorTurno);
    }
}
