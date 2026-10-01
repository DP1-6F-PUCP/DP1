package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.backend.dto.EjecucionEscenarioDTO;
import com.paqrap.backend.dto.ProgramarSolicitudRequestDTO;
import com.paqrap.backend.dto.SeleccionarEscenarioRequestDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Inicia ejecuciones de escenario y encola cambios "en caliente" sobre ellas, vía
 * {@link ServicioPlanificacion#seleccionarEscenario} / {@link ServicioPlanificacion#programarSolicitud}.
 *
 * <p>{@code programarSolicitud} pide un {@link EjecucionEscenario} completo, no solo su id -- pero
 * {@code ServicioPlanificacionImpl} solo usa {@code getIdEjecucion()} internamente (busca el
 * {@code OrquestadorOperacion} correspondiente en un mapa por id), así que este controlador
 * reconstruye un {@link EjecucionEscenario} "cascarón" con el id que llega en la URL -- el
 * tipo/fecha de ese objeto son irrelevantes para esta llamada, per el propio código de la
 * implementación de referencia.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class SimulacionController {

    private final ServicioPlanificacion servicioPlanificacion;

    @PostMapping("/api/escenarios")
    public ResponseEntity<ApiResponseDTO<EjecucionEscenarioDTO>> iniciarEscenario(
            @Valid @RequestBody SeleccionarEscenarioRequestDTO request) {
        LocalDateTime fechaInicioSimulada = request.fechaInicioSimulada() != null
                ? LocalDateTime.ofInstant(request.fechaInicioSimulada(), ZoneOffset.UTC)
                : LocalDateTime.now();
        EjecucionEscenario ejecucion = servicioPlanificacion.seleccionarEscenario(request.tipo(), fechaInicioSimulada);
        log.info("Escenario iniciado: id={} tipo={} fechaInicioSimulada={}", ejecucion.getIdEjecucion(), request.tipo(),
                fechaInicioSimulada);
        EjecucionEscenarioDTO dto = aDTO(ejecucion);
        return ResponseEntity.created(URI.create("/api/escenarios/" + ejecucion.getIdEjecucion()))
                .body(ApiResponseDTO.of(dto));
    }

    @PostMapping("/api/escenarios/{id}/solicitudes")
    public ApiResponseDTO<Void> programarSolicitud(@PathVariable String id,
            @Valid @RequestBody ProgramarSolicitudRequestDTO request) {
        EjecucionEscenario referencia = new EjecucionEscenario(id, TipoEscenario.DIA_A_DIA, LocalDateTime.now());
        LocalDateTime tiempoSimulado = LocalDateTime.ofInstant(request.tiempoSimulado(), ZoneOffset.UTC);
        servicioPlanificacion.programarSolicitud(referencia, tiempoSimulado, request.tipoSolicitud(),
                request.entidadObjetivo(), request.valorNuevo());
        log.info("Solicitud programada sobre escenario {}: {} -> {} ({})", id, request.tipoSolicitud(),
                request.entidadObjetivo(), request.valorNuevo());
        return ApiResponseDTO.of(null);
    }

    private EjecucionEscenarioDTO aDTO(EjecucionEscenario ejecucion) {
        return new EjecucionEscenarioDTO(
                ejecucion.getIdEjecucion(),
                ejecucion.getTipoEscenario().name(),
                ejecucion.getEstado().name(),
                aInstant(ejecucion.getFechaInicio()),
                aInstant(ejecucion.getFechaInicioSimulada()));
    }

    private Instant aInstant(LocalDateTime fecha) {
        return fecha == null ? null : fecha.toInstant(ZoneOffset.UTC);
    }
}
