package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.exposicion.EnsambladorRespuestas;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.EventoDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * {@code GET /api/alerts}: combina las alertas de riesgo de SLA (calculadas bajo demanda, no son
 * un evento registrado -- ver {@link EnsambladorRespuestas#alertasRiesgoSLADesdeDTO}) con los
 * eventos de incidencia ya registrados por el motor de simulación (bloqueos, averías).
 *
 * <p>No cubre alertas de colapso: {@link EstadoOperacionDTO} no expone el
 * {@code EstadoEjecucion} de la ejecución activa -- requeriría extender ese contrato, que se deja
 * pendiente hasta que el equipo defina el criterio de colapso (ver nota metodológica del reporte
 * de experimentación).
 */
@RestController
@RequiredArgsConstructor
public class AlertasController {

    private static final Set<String> TIPOS_INCIDENCIA = Set.of("INCIDENCIA_BLOQUEO", "INCIDENCIA_AVERIA_VEHICULO");

    private final ServicioPlanificacion servicioPlanificacion;

    @GetMapping("/api/alerts")
    public ApiResponseDTO<List<EventoDTO>> alertas(
            @RequestParam(defaultValue = "1.0") double horasUmbralSLA) {
        EstadoOperacionDTO estado = servicioPlanificacion.consultarEstadoOperacion();

        List<EventoDTO> alertas = new ArrayList<>();
        alertas.addAll(EnsambladorRespuestas.alertasRiesgoSLADesdeDTO(servicioPlanificacion.consultarPedidos(null),
                estado.marcaTiempoActual(), horasUmbralSLA));
        alertas.addAll(estado.eventos().stream().filter(e -> TIPOS_INCIDENCIA.contains(e.tipo())).toList());

        return ApiResponseDTO.of(alertas);
    }
}
