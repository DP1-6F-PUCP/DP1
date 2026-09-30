package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.exposicion.ConfiguracionActualDTO;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.PedidoDTO;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
}
