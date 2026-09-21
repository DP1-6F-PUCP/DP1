package com.paqrap.exposicion;

import java.time.LocalDateTime;

/** Representación de un {@link com.paqrap.dominio.Pedido} para el visualizador. */
public record PedidoDTO(String idPedido, String idCliente, String estado, int posX, int posY, int cantidadSolicitada,
        int cantidadEntregada, LocalDateTime fechaLimite) {
}
