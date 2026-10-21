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

    /**
     * Primer instante en que puede EMPEZAR el refrigerio del turno que arranca en
     * {@code inicioTurno}: al menos {@code margenRefrigerioHoras} después del cambio de turno
     * (caso: "al menos una hora antes o una hora después de un cambio de turno").
     */
    public LocalDateTime inicioVentanaRefrigerio(LocalDateTime inicioTurno) {
        return inicioTurno.plusSeconds(Math.round(margenRefrigerioHoras * 3600.0));
    }

    /**
     * Último instante en que puede EMPEZAR el refrigerio: debe terminar al menos
     * {@code margenRefrigerioHoras} antes del fin del turno. Con la configuración oficial (turno
     * 07-15, 1h de refrigerio, 1h de margen) la ventana es 08:00-13:00.
     *
     * <p>Antes, simulador y planificadores ponían el refrigerio de TODA la flota en el punto medio
     * del turno (11:00): la flota entera se detenía a la vez una hora a mediodía -- visto en vivo,
     * casi todos los vehículos en pausa a las 12:30 -- y los pedidos urgentes de esa franja se
     * incumplían. Ahora un vehículo ocioso lo toma en cuanto se abre la ventana, y uno ocupado a
     * más tardar en este instante.
     */
    public LocalDateTime inicioRefrigerioMasTardio(LocalDateTime inicioTurno) {
        LocalDateTime masTardio = inicioTurno.plusSeconds(
                Math.round((duracionTurnoHoras - margenRefrigerioHoras - duracionRefrigerioHoras) * 3600.0));
        LocalDateTime ventana = inicioVentanaRefrigerio(inicioTurno);
        return masTardio.isBefore(ventana) ? ventana : masTardio;
    }

    /**
     * Instante en que una unidad averiada vuelve a estar disponible, según el caso PaqRap (Q&A del
     * curso, "Averías"):
     * <ul>
     *   <li>Tipo 1: no disponible por 2 horas.</li>
     *   <li>Tipo 2: no disponible hasta el final del turno siguiente al de la avería.</li>
     *   <li>Tipo 3: no disponible por al menos 2 días; retorna al inicio del turno de la tarde
     *       (el segundo turno del día, 15:00 con la configuración oficial).</li>
     * </ul>
     */
    public LocalDateTime finIndisponibilidadAveria(TipoAveria tipo, LocalDateTime instanteAveria) {
        long minutosPorTurno = Math.round(duracionTurnoHoras * 60);
        return switch (tipo) {
            case TIPO_1 -> instanteAveria.plusHours(2);
            case TIPO_2 -> inicioTurnoQueContiene(instanteAveria).plusMinutes(2 * minutosPorTurno);
            case TIPO_3 -> {
                LocalDateTime minimo = instanteAveria.plusDays(2);
                LocalDateTime retorno = minimo.toLocalDate()
                        .atTime(LocalTime.of((int) horaInicioTurno, 0))
                        .plusMinutes(minutosPorTurno);
                yield retorno.isBefore(minimo) ? retorno.plusDays(1) : retorno;
            }
        };
    }
}
