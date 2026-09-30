package com.paqrap.backend.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * Mantiene el conjunto de sesiones WebSocket abiertas en {@code /ws/simulation}. No procesa
 * mensajes entrantes del cliente -- este canal es solo de servidor a cliente (push), per el
 * diseño acordado: el backend empuja el lote completo cuando se recalcula y eventos puntuales
 * (avería, bloqueo, entrega), y el frontend interpola el movimiento entre lotes localmente en vez
 * de pedirle al servidor una posición recalculada cada 500ms.
 */
@Slf4j
@Component
public class SimulationWebSocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sesiones = new CopyOnWriteArraySet<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sesiones.add(session);
        log.info("Sesión WebSocket conectada: {} ({} activas)", session.getId(), sesiones.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sesiones.remove(session);
        log.info("Sesión WebSocket cerrada: {} ({} activas)", session.getId(), sesiones.size());
    }

    /** Envía {@code payload} (ya serializado a JSON) a todas las sesiones abiertas. */
    public void difundir(String payload) {
        TextMessage mensaje = new TextMessage(payload);
        for (WebSocketSession sesion : sesiones) {
            try {
                if (sesion.isOpen()) {
                    sesion.sendMessage(mensaje);
                }
            } catch (IOException ex) {
                log.warn("No se pudo enviar TICK_UPDATE a la sesión {}: {}", sesion.getId(), ex.getMessage());
            }
        }
    }

    public boolean hayOyentes() {
        return !sesiones.isEmpty();
    }
}
