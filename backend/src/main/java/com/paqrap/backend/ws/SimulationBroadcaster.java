package com.paqrap.backend.ws;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.backend.dto.TickUpdateDTO;
import com.paqrap.exposicion.EnsambladorRespuestas;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Revisa cada 250ms si se cerró un lote nuevo (compara {@code marcaTiempoActual}, que es el ancla
 * del último lote) y, de ser así, lo empuja por WebSocket a todas las sesiones abiertas. No
 * consulta el estado si no hay nadie escuchando -- evita trabajo innecesario cuando no hay
 * visualizador conectado.
 *
 * <p>250ms (antes 1s): con sa=5s, 1s de latencia era el 20% del intervalo entre lotes y se comía
 * el margen del buffer de interpolación del front. Revisar es barato: consultarEstadoOperacion
 * devuelve la instantánea ya publicada al cierre del lote, no la reconstruye.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SimulationBroadcaster {

    private static final double HORAS_UMBRAL_SLA = 1.0;

    private final ServicioPlanificacion servicioPlanificacion;
    private final SimulationWebSocketHandler handler;
    private final ObjectMapper objectMapper;

    private volatile LocalDateTime ultimaMarcaEnviada;

    @Scheduled(fixedRate = 250)
    public void difundirSiHayLoteNuevo() {
        if (!handler.hayOyentes()) {
            return;
        }

        EstadoOperacionDTO estado = servicioPlanificacion.consultarEstadoOperacion();
        if (estado.marcaTiempoActual() == null || estado.marcaTiempoActual().equals(ultimaMarcaEnviada)) {
            return;
        }
        ultimaMarcaEnviada = estado.marcaTiempoActual();

        var alertas = EnsambladorRespuestas.alertasRiesgoSLADesdeDTO(servicioPlanificacion.consultarPedidos(null),
                estado.marcaTiempoActual(), HORAS_UMBRAL_SLA);
        TickUpdateDTO tick = new TickUpdateDTO("LOTE_ACTUALIZADO", estado, alertas);

        try {
            handler.difundir(objectMapper.writeValueAsString(tick));
        } catch (JsonProcessingException ex) {
            log.error("No se pudo serializar TICK_UPDATE", ex);
        }
    }
}
