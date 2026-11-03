package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Representación de un {@link com.paqrap.dominio.Pedido} para el visualizador.
 *
 * @param fechaEntrega instante de la última entrega cumplida; null mientras no esté ENTREGADA
 * @param origenX nodo desde el que salió su último despacho; null si aún no se despachó
 * @param origenY ver {@code origenX}
 * @param fechaSalida instante de su último despacho; null si aún no se despachó
 */
public record PedidoDTO(String idPedido, String idCliente, String estado, int posX, int posY, int cantidadSolicitada,
        int cantidadEntregada, LocalDateTime fechaIngreso, int horasLimite, LocalDateTime fechaLimite,
        LocalDateTime fechaEntrega, Integer origenX, Integer origenY, LocalDateTime fechaSalida) {
}
