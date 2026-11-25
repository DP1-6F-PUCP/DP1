package com.paqrap.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.backend.persistence.CatalogoPersistenceService;
import org.springframework.beans.factory.ObjectProvider;
import com.paqrap.exposicion.AveriaRegistroDTO;
import com.paqrap.exposicion.ConfiguracionActualDTO;
import com.paqrap.exposicion.MantenimientoDTO;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.PaginaPedidosDTO;
import com.paqrap.exposicion.PedidoDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Consultas de solo lectura sobre {@link ServicioPlanificacion} -- sin efectos secundarios, per
 * 65.std.api sección 3 (GET nunca modifica estado).
 */
@RestController
@RequiredArgsConstructor
public class ConsultaController {

    private final ServicioPlanificacion servicioPlanificacion;
    private final ObjectProvider<CatalogoPersistenceService> catalogoProvider;
    private final ObjectMapper objectMapper;

    @GetMapping("/api/pedidos")
    public ApiResponseDTO<List<PedidoDTO>> consultarPedidos(@RequestParam(required = false) String estado) {
        var filtro = estado == null ? null : new com.paqrap.exposicion.FiltroPedidos(estado);
        return ApiResponseDTO.of(servicioPlanificacion.consultarPedidos(filtro));
    }

    @GetMapping("/api/configuracion")
    public ApiResponseDTO<ConfiguracionActualDTO> consultarConfiguracion() {
        return ApiResponseDTO.of(servicioPlanificacion.consultarConfiguracionActual());
    }

    /**
     * Valores oficiales del caso (perfil inmutable en BD, V6): única fuente para "Restaurar valores
     * oficiales". La configuración vigente ({@code /api/configuracion}) conserva los ajustes de
     * ejecuciones anteriores, así que no sirve como "por defecto".
     */
    @GetMapping("/api/configuracion/oficial")
    public ApiResponseDTO<JsonNode> consultarConfiguracionOficial() {
        CatalogoPersistenceService catalogo = catalogoProvider.getIfAvailable();
        String json = catalogo != null ? catalogo.cargarConfiguracionOficialJson().orElse(null) : null;
        if (json == null) {
            throw new IllegalStateException("No hay valores oficiales registrados en la base de datos.");
        }
        try {
            return ApiResponseDTO.of(objectMapper.readTree(json));
        } catch (java.io.IOException ex) {
            throw new IllegalStateException("Los valores oficiales guardados no son JSON válido.", ex);
        }
    }

    @GetMapping("/api/estado-operacion")
    public ApiResponseDTO<EstadoOperacionDTO> consultarEstadoOperacion() {
        return ApiResponseDTO.of(servicioPlanificacion.consultarEstadoOperacion());
    }

    /** Lotes con secuencia >= desde (se guardan los últimos 12): el mapa recupera los que se perdió. */
    @GetMapping("/api/estado-operacion/lotes")
    public ApiResponseDTO<List<EstadoOperacionDTO>> consultarLotesDesde(@RequestParam(defaultValue = "1") long desde) {
        return ApiResponseDTO.of(servicioPlanificacion.consultarLotesDesde(desde));
    }

    /** Calendario de mantenimientos de la ejecución activa (opcionalmente acotado a [desde, hasta)). */
    @GetMapping("/api/estado-operacion/mantenimientos")
    public ApiResponseDTO<List<MantenimientoDTO>> consultarMantenimientos(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime hasta) {
        return ApiResponseDTO.of(servicioPlanificacion.consultarMantenimientos(desde, hasta));
    }

    /** Averías ocurridas en la ejecución activa, en orden de ocurrencia. */
    @GetMapping("/api/estado-operacion/averias")
    public ApiResponseDTO<List<AveriaRegistroDTO>> consultarHistorialAverias() {
        return ApiResponseDTO.of(servicioPlanificacion.consultarHistorialAverias());
    }

    /** Historial paginado (más recientes primero) para buscar pedidos sin traer la lista completa. */
    @GetMapping("/api/pedidos/historial")
    public ApiResponseDTO<PaginaPedidosDTO> consultarHistorial(@RequestParam(required = false) String estado,
            @RequestParam(required = false) String texto,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime hasta,
            @RequestParam(defaultValue = "0") int pagina, @RequestParam(defaultValue = "50") int tamano) {
        return ApiResponseDTO.of(
                servicioPlanificacion.consultarHistorialPedidos(estado, texto, desde, hasta, pagina, tamano));
    }
}
