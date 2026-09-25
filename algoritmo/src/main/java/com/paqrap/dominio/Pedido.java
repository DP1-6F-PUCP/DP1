package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Orden de entrega de producto P hecha por un cliente, con su plazo comprometido. */
public class Pedido {

    private final String idPedido;
    private final String idCliente;
    private final Nodo destino;
    private final int cantidadSolicitada;
    private final int horasLimite;
    private final LocalDateTime fechaIngreso;
    private final LocalDateTime fechaLimite;
    private EstadoPedido estado;
    private final List<ParadaPlanificada> entregasParciales = new ArrayList<>();

    public Pedido(String idPedido, String idCliente, Nodo destino, int cantidadSolicitada, int horasLimite,
            LocalDateTime fechaIngreso) {
        this.idPedido = idPedido;
        this.idCliente = idCliente;
        this.destino = destino;
        this.cantidadSolicitada = cantidadSolicitada;
        this.horasLimite = horasLimite;
        this.fechaIngreso = fechaIngreso;
        this.fechaLimite = fechaIngreso.plusHours(horasLimite);
        this.estado = EstadoPedido.PENDIENTE;
    }

    public String getIdPedido() {
        return idPedido;
    }

    public String getIdCliente() {
        return idCliente;
    }

    public Nodo getDestino() {
        return destino;
    }

    public int getCantidadSolicitada() {
        return cantidadSolicitada;
    }

    public int getHorasLimite() {
        return horasLimite;
    }

    public LocalDateTime getFechaIngreso() {
        return fechaIngreso;
    }

    public LocalDateTime getFechaLimite() {
        return fechaLimite;
    }

    public EstadoPedido getEstado() {
        return estado;
    }

    public List<ParadaPlanificada> getEntregasParciales() {
        return entregasParciales;
    }

    /**
     * Recalcula el estado del pedido según lo entregado hasta el momento y el instante actual.
     *
     * <p>Un pedido queda {@code ENTREGADA} cuando la suma de sus entregas parciales cumplidas
     * alcanza la cantidad solicitada; queda {@code INCUMPLIDA} si el instante actual supera la
     * fecha límite sin haberse completado la entrega.
     *
     * @param instanteActual momento de evaluación
     */
    public void actualizarEstado(LocalDateTime instanteActual) {
        if (cantidadEntregadaTotal() >= cantidadSolicitada) {
            estado = EstadoPedido.ENTREGADA;
        } else if (instanteActual.isAfter(fechaLimite)) {
            estado = EstadoPedido.INCUMPLIDA;
        } else {
            estado = EstadoPedido.PENDIENTE;
        }
    }

    /**
     * Suma las cantidades de las entregas parciales cumplidas.
     *
     * @return unidades de producto P efectivamente entregadas
     */
    public int cantidadEntregadaTotal() {
        return entregasParciales.stream()
                .filter(parada -> parada.getEstado() == EstadoParada.CUMPLIDA)
                .mapToInt(ParadaPlanificada::getCantidadAEntregar)
                .sum();
    }

    @Override
    public String toString() {
        return idPedido;
    }
}
