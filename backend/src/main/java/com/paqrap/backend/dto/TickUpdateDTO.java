package com.paqrap.backend.dto;

import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.EventoDTO;

import java.util.List;

/**
 * Mensaje empujado por {@code /ws/simulation} cada vez que se recalcula un lote de planificación.
 * A diferencia del {@code TICK_UPDATE} cada 500ms del documento original del frontend, este mensaje
 * lleva el plan completo (rutas, paradas, eventos) una sola vez por lote -- el frontend interpola
 * la posición de cada vehículo localmente entre lotes en vez de pedirle al servidor una posición
 * recalculada en cada tick (ver nota metodológica del reporte de experimentación).
 */
public record TickUpdateDTO(String event, EstadoOperacionDTO estado, List<EventoDTO> alertas) {
}
