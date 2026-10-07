package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.backend.dto.EjecucionEscenarioDTO;
import com.paqrap.backend.dto.ProgramarSolicitudRequestDTO;
import com.paqrap.backend.dto.SeleccionarEscenarioRequestDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.SolicitudOperacion;
import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

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
        List<SolicitudOperacion> ajustesIniciales = request.ajustesIniciales() == null ? List.of()
                : request.ajustesIniciales().stream()
                        .map(a -> new SolicitudOperacion(fechaInicioSimulada, a.tipoSolicitud(), a.entidadObjetivo(),
                                a.valorNuevo()))
                        .toList();
        EjecucionEscenario ejecucion = servicioPlanificacion.seleccionarEscenario(request.tipo(), fechaInicioSimulada,
                ajustesIniciales);
        // Bug real corregido: logueaba request.tipo()/fechaInicioSimulada (lo PEDIDO), no lo que
        // realmente quedó activo -- si ya había una ejecución en curso, seleccionarEscenario se
        // "une" a ella devolviendo su tipo/fecha real (ver su Javadoc: una sola ejecución global a
        // la vez), y el log anterior ocultaba exactamente ese caso, el más confuso de diagnosticar.
        log.info("Escenario iniciado/unido: id={} tipo={} fechaInicioSimulada={} (solicitado: tipo={})",
                ejecucion.getIdEjecucion(), ejecucion.getTipoEscenario(), ejecucion.getFechaInicioSimulada(),
                request.tipo());
        EjecucionEscenarioDTO dto = aDTO(ejecucion);
        return ResponseEntity.created(URI.create("/api/escenarios/" + ejecucion.getIdEjecucion()))
                .body(ApiResponseDTO.of(dto));
    }

    /**
     * Bug real corregido: sin este endpoint, una pestaña nueva o recién recargada no tenía forma
     * de saber que ya había una ejecución activa (el frontend no persiste el id en ningún lado) --
     * el usuario quedaba viendo la pantalla de "Iniciar ejecución" aunque el backend sí tuviera una
     * corriendo, hasta que volvía a hacer clic manualmente. {@code SeleccionarEscenarioGate} llama
     * esto al montar para unirse sola, sin esperar esa acción.
     */
    @GetMapping("/api/escenarios/activa")
    public ApiResponseDTO<EjecucionEscenarioDTO> consultarEscenarioActiva() {
        EjecucionEscenario ejecucion = servicioPlanificacion.consultarEjecucionActiva();
        return ApiResponseDTO.of(ejecucion != null ? aDTO(ejecucion) : null);
    }

    @PostMapping("/api/escenarios/{id}/solicitudes")
    public ApiResponseDTO<Void> programarSolicitud(@PathVariable String id,
            @Valid @RequestBody ProgramarSolicitudRequestDTO request) {
        EjecucionEscenario referencia = new EjecucionEscenario(id, TipoEscenario.DIA_A_DIA, LocalDateTime.now(), 0f, 0f);
        LocalDateTime tiempoSimulado = LocalDateTime.ofInstant(request.tiempoSimulado(), ZoneOffset.UTC);
        servicioPlanificacion.programarSolicitud(referencia, tiempoSimulado, request.tipoSolicitud(),
                request.entidadObjetivo(), request.valorNuevo());
        log.info("Solicitud programada sobre escenario {}: {} -> {} ({})", id, request.tipoSolicitud(),
                request.entidadObjetivo(), request.valorNuevo());
        return ApiResponseDTO.of(null);
    }

    @GetMapping("/api/escenarios/{id}")
    public ApiResponseDTO<EjecucionEscenarioDTO> consultarEscenario(@PathVariable String id) {
        EjecucionEscenario ejecucion = servicioPlanificacion.consultarEjecucion(id);
        return ApiResponseDTO.of(aDTO(ejecucion));
    }

    @PostMapping("/api/escenarios/{id}/pausar")
    public ApiResponseDTO<Void> pausar(@PathVariable String id) {
        servicioPlanificacion.pausarEjecucion(id);
        log.info("Ejecución {} pausada", id);
        return ApiResponseDTO.of(null);
    }

    @PostMapping("/api/escenarios/{id}/reanudar")
    public ApiResponseDTO<Void> reanudar(@PathVariable String id) {
        servicioPlanificacion.reanudarEjecucion(id);
        log.info("Ejecución {} reanudada", id);
        return ApiResponseDTO.of(null);
    }

    @PostMapping("/api/escenarios/{id}/detener")
    public ApiResponseDTO<Void> detener(@PathVariable String id) {
        servicioPlanificacion.detenerEjecucion(id);
        log.info("Ejecución {} detenida", id);
        return ApiResponseDTO.of(null);
    }

    private EjecucionEscenarioDTO aDTO(EjecucionEscenario ejecucion) {
        return new EjecucionEscenarioDTO(
                ejecucion.getIdEjecucion(),
                ejecucion.getTipoEscenario().name(),
                ejecucion.getEstado().name(),
                aInstant(ejecucion.getFechaInicio()),
                aInstant(ejecucion.getFechaInicioSimulada()),
                ejecucion.getSa(),
                ejecucion.getK());
    }

    private Instant aInstant(LocalDateTime fecha) {
        return fecha == null ? null : fecha.toInstant(ZoneOffset.UTC);
    }
}
