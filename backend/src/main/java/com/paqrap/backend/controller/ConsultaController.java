package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.exposicion.ConfiguracionActualDTO;
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

    @GetMapping("/api/pedidos")
    public ApiResponseDTO<List<PedidoDTO>> consultarPedidos(@RequestParam(required = false) String estado) {
        var filtro = estado == null ? null : new com.paqrap.exposicion.FiltroPedidos(estado);
        return ApiResponseDTO.of(servicioPlanificacion.consultarPedidos(filtro));
    }

    @GetMapping("/api/configuracion")
    public ApiResponseDTO<ConfiguracionActualDTO> consultarConfiguracion() {
        return ApiResponseDTO.of(servicioPlanificacion.consultarConfiguracionActual());
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
