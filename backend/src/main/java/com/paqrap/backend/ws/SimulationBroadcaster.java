package com.paqrap.backend.ws;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.backend.dto.TickUpdateDTO;
import com.paqrap.exposicion.EnsambladorRespuestas;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Empuja cada lote por WebSocket en el momento en que se publica (antes se revisaba cada 250 ms
 * comparando la marca de tiempo: si dos lotes se publicaban dentro de esa ventana, p. ej. los
 * precalculados al arrancar, el primero se perdía y el mapa nunca dibujaba esa trayectoria).
 *
 * <p>El envío corre en un hilo propio para no demorar el ciclo de planificación, y en orden: un
 * único hilo garantiza que el lote N siempre sale antes que el N+1. Cada lote lleva su
 * {@code secuencia}; si al front igualmente le falta alguno (reconexión), lo pide a
 * {@code GET /api/estado-operacion/lotes?desde=N}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SimulationBroadcaster {

    private static final double HORAS_UMBRAL_SLA = 1.0;

    private final ServicioPlanificacion servicioPlanificacion;
    private final SimulationWebSocketHandler handler;
    private final ObjectMapper objectMapper;

    private final ExecutorService envios = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ws-difusion-lotes");
        t.setDaemon(true);
        return t;
    });

    @PostConstruct
    void suscribir() {
        servicioPlanificacion.suscribirPublicaciones(estado -> envios.execute(() -> difundir(estado)));
    }

    @PreDestroy
    void cerrar() {
        envios.shutdownNow();
    }

    private void difundir(EstadoOperacionDTO estado) {
        if (!handler.hayOyentes() || estado.marcaTiempoActual() == null) {
            return;
        }
        // Solo los pendientes pueden estar en riesgo de SLA: no recorrer el historial completo.
        var alertas = EnsambladorRespuestas.alertasRiesgoSLADesdeDTO(
                servicioPlanificacion.consultarPedidos(new com.paqrap.exposicion.FiltroPedidos("PENDIENTE")),
                estado.marcaTiempoActual(), HORAS_UMBRAL_SLA);
        TickUpdateDTO tick = new TickUpdateDTO("LOTE_ACTUALIZADO", estado, alertas);
        try {
            handler.difundir(objectMapper.writeValueAsString(tick));
        } catch (JsonProcessingException ex) {
            log.error("No se pudo serializar TICK_UPDATE", ex);
        }
    }
}
