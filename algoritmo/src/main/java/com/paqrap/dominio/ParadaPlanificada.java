package com.paqrap.dominio;

import java.time.LocalDateTime;

/** Entrega (total o parcial) de un {@link Pedido} planificada dentro de una {@link Ruta}. */
public class ParadaPlanificada {

    private final Pedido pedido;
    private final int cantidadAEntregar;
    private EstadoParada estado;
    private LocalDateTime fechaEntregada;
    /**
     * Instante absoluto (no relativo a un lote) en que el vehículo llegó al destino y empezó el
     * servicio de entrega. {@code null} mientras no ha llegado. Se fija UNA sola vez -- si el
     * servicio (p. ej. 1h) no cabe dentro de la ventana de un solo lote, lotes posteriores
     * retoman el conteo desde este instante en vez de reiniciar el servicio completo cada vez
     * (bug real corregido: antes de esto, un servicio más largo que la ventana de un lote nunca
     * terminaba, en ningún lote, porque se reiniciaba desde cero cada vez).
     */
    private LocalDateTime horaInicioServicio;

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

    public LocalDateTime getHoraInicioServicio() {
        return horaInicioServicio;
    }

    public void setHoraInicioServicio(LocalDateTime horaInicioServicio) {
        this.horaInicioServicio = horaInicioServicio;
    }

    @Override
    public String toString() {
        return "Parada[pedido=" + pedido + ", cantidad=" + cantidadAEntregar + ", estado=" + estado + "]";
    }
}
