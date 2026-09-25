package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Secuencia de paradas de entrega planificadas para una {@link UnidadTransporte}.
 *
 * <p>A nivel de dominio, una ruta se modela a nivel de parada ({@link ParadaPlanificada}), no
 * nodo a nodo: el camino físico entre dos paradas consecutivas es un detalle de cálculo interno
 * de cada algoritmo (vía {@link CalculadorDistancia}), no un dato persistido del dominio.
 */
public class Ruta {

    private final String idRuta;
    private double costoEstimado;
    private double duracionEstimada;
    private EstadoRuta estado;
    private final LocalDateTime horaInicioPlanificada;
    private final List<ParadaPlanificada> secuenciaParadas = new ArrayList<>();
    private final UnidadTransporte unidadTransporte;

    public Ruta(String idRuta, LocalDateTime horaInicioPlanificada, UnidadTransporte unidadTransporte) {
        this.idRuta = idRuta;
        this.horaInicioPlanificada = horaInicioPlanificada;
        this.unidadTransporte = unidadTransporte;
        this.estado = EstadoRuta.PLANIFICADA;
    }

    public String getIdRuta() {
        return idRuta;
    }

    public double getCostoEstimado() {
        return costoEstimado;
    }

    public void setCostoEstimado(double costoEstimado) {
        this.costoEstimado = costoEstimado;
    }

    public double getDuracionEstimada() {
        return duracionEstimada;
    }

    public void setDuracionEstimada(double duracionEstimada) {
        this.duracionEstimada = duracionEstimada;
    }

    public EstadoRuta getEstado() {
        return estado;
    }

    public void setEstado(EstadoRuta estado) {
        this.estado = estado;
    }

    public LocalDateTime getHoraInicioPlanificada() {
        return horaInicioPlanificada;
    }

    public List<ParadaPlanificada> getSecuenciaParadas() {
        return secuenciaParadas;
    }

    public UnidadTransporte getUnidadTransporte() {
        return unidadTransporte;
    }

    /**
     * Suma la carga total comprometida por todas las paradas de la ruta.
     *
     * @return unidades de producto P a transportar, sumando todas las paradas planificadas
     */
    public int cargaTotal() {
        return secuenciaParadas.stream()
                .mapToInt(ParadaPlanificada::getCantidadAEntregar)
                .sum();
    }

    /**
     * Marca como cumplida la parada correspondiente al pedido dado y actualiza su estado.
     *
     * @param pedido pedido cuya parada se marca como entregada
     * @param cantidadEntregada cantidad efectivamente entregada en esta parada
     * @param instante momento de la entrega
     */
    public void marcarParadaCumplida(Pedido pedido, int cantidadEntregada, LocalDateTime instante) {
        ParadaPlanificada parada = secuenciaParadas.stream()
                .filter(p -> p.getPedido().equals(pedido) && p.getEstado() != EstadoParada.CUMPLIDA)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No hay una parada pendiente para el pedido " + pedido.getIdPedido() + " en la ruta " + idRuta));
        parada.setEstado(EstadoParada.CUMPLIDA);
        parada.setFechaEntregada(instante);
        pedido.actualizarEstado(instante);
    }

    @Override
    public String toString() {
        return idRuta;
    }
}
