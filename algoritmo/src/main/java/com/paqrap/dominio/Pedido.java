package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

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
    // CopyOnWriteArrayList: Ruta.marcarParadaCumplida la escribe desde el hilo del scheduler de
    // OrquestadorOperacion mientras una consulta de estado concurrente puede leerla (vía
    // cantidadEntregadaTotal/actualizarEstado o al armar PedidoDTO) -- mismo patrón de riesgo que
    // causó el ConcurrentModificationException real en UnidadTransporte.rutas.
    private final List<ParadaPlanificada> entregasParciales = new CopyOnWriteArrayList<>();
    // Último despacho que lo llevó (nodo e instante de salida). Se guarda en el pedido porque las
    // rutas FINALIZADAS dejan de exponerse en el estado, y sin esto un pedido entregado pierde su
    // almacén de origen en el panel de almacenes.
    private volatile Nodo nodoDespacho;
    private volatile LocalDateTime fechaDespacho;

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

    public Nodo getNodoDespacho() {
        return nodoDespacho;
    }

    public LocalDateTime getFechaDespacho() {
        return fechaDespacho;
    }

    public void registrarDespacho(Nodo nodo, LocalDateTime instante) {
        this.nodoDespacho = nodo;
        this.fechaDespacho = instante;
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
     * Instante de la última entrega parcial cumplida, o null si el pedido aún no está
     * {@code ENTREGADA}.
     */
    public LocalDateTime fechaEntregaFinal() {
        if (estado != EstadoPedido.ENTREGADA) {
            return null;
        }
        return entregasParciales.stream()
                .filter(parada -> parada.getEstado() == EstadoParada.CUMPLIDA)
                .map(ParadaPlanificada::getFechaEntregada)
                .filter(java.util.Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);
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
