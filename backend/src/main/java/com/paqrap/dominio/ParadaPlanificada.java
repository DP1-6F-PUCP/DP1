package com.paqrap.dominio;

import java.time.LocalDateTime;

/** Entrega (total o parcial) de un {@link Pedido} planificada dentro de una {@link Ruta}. */
public class ParadaPlanificada {

    private final Pedido pedido;
    private final int cantidadAEntregar;
    private EstadoParada estado;
    private LocalDateTime fechaEntregada;

    public ParadaPlanificada(Pedido pedido, int cantidadAEntregar) {
        this.pedido = pedido;
        this.cantidadAEntregar = cantidadAEntregar;
        this.estado = EstadoParada.PLANIFICADA;
    }

    public Pedido getPedido() {
        return pedido;
    }

    public int getCantidadAEntregar() {
        return cantidadAEntregar;
    }

    public EstadoParada getEstado() {
        return estado;
    }

    public void setEstado(EstadoParada estado) {
        this.estado = estado;
    }

    public LocalDateTime getFechaEntregada() {
        return fechaEntregada;
    }

    public void setFechaEntregada(LocalDateTime fechaEntregada) {
        this.fechaEntregada = fechaEntregada;
    }

    @Override
    public String toString() {
        return "Parada[pedido=" + pedido + ", cantidad=" + cantidadAEntregar + ", estado=" + estado + "]";
    }
}
