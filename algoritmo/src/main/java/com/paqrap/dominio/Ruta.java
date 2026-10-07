package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    private static final DateTimeFormatter ID_INSTANTE = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    /**
     * Id legible y único por ejecución para una ruta nueva. Bug real corregido (confirmado en
     * vivo: dos objetos {@code Ruta} distintos -- uno ya {@code FINALIZADA}, otro recién
     * {@code EN_EJECUCION} -- con el idRuta idéntico "TM14-vacia" en la misma respuesta de
     * {@code GET /api/estado-operacion}): cada planificador ({@code SolucionadorALNS},
     * {@code SolucionadorParticionConjuntos}, {@code PlanificadorIPSO}) arma el id de una ruta
     * nueva solo con {@code idUnidad + sufijo fijo} ("-r1", "-vacia") o, en el caso de IPSO, un
     * contador que se reinicia a 0 en CADA llamada a {@code planificarRutas} -- ninguno de los
     * dos es único entre lotes distintos de la MISMA ejecución, así que un vehículo que recibe
     * rutas nuevas en más de un lote termina con ids repetidos. El frontend usa {@code idRuta}
     * como key de lista (React) y para seleccionar una ruta en la pantalla "Rutas" -- un id
     * repetido ahí causa advertencias de key duplicada y puede hacer que se seleccione/muestre la
     * ruta vieja en vez de la vigente. Se agrega el instante simulado (único por lote, el reloj
     * solo avanza) para que el id sea único sin que el planificador necesite guardar estado
     * mutable entre llamadas -- IPSO fue deliberadamente rediseñado para no conservar ningún
     * estado entre invocaciones (ver su Javadoc), así que un contador de instancia ahí sería un
     * paso atrás.
     */
    public static String generarId(String idUnidad, LocalDateTime instante, String sufijo) {
        return idUnidad + "-" + instante.format(ID_INSTANTE) + "-" + sufijo;
    }

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
        // Bug real corregido: sin esto, Pedido.entregasParciales quedaba SIEMPRE vacía (nada más
        // en todo el código le agregaba nada), así que Pedido.cantidadEntregadaTotal() siempre
        // devolvía 0 y actualizarEstado() nunca podía pasar a ENTREGADA -- ningún pedido se
        // marcaba como entregado jamás, sin importar que la entrega sí ocurriera en la simulación.
        pedido.getEntregasParciales().add(parada);
        pedido.actualizarEstado(instante);
    }

    @Override
    public String toString() {
        return idRuta;
    }
}
