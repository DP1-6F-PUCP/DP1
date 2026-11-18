package com.paqrap.exposicion;

import java.util.List;

/** Una página del historial de pedidos de la ejecución (para buscar pedidos ya entregados sin traer todo). */
public record PaginaPedidosDTO(long total, int pagina, int tamano, List<PedidoDTO> pedidos) {
}
