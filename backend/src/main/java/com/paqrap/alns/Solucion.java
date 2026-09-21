package com.paqrap.alns;

import com.paqrap.dominio.EstadoParada;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;

import java.util.ArrayList;
import java.util.List;

/**
 * Estado interno de búsqueda de ALNS: la solución de trabajo que el algoritmo muta durante los
 * ciclos de destrucción y reparación.
 *
 * <p>No es el tipo de retorno público del algoritmo — {@link #aRutas()} extrae el contrato
 * canónico ({@code List<Ruta>}) y, en ese momento de "commit", registra cada parada planificada
 * en la lista de entregas parciales del pedido correspondiente. Mientras la solución solo existe
 * como estado de búsqueda (copias descartables durante la exploración de vecindarios), las
 * paradas planificadas de prueba nunca tocan {@link Pedido#getEntregasParciales()}.
 *
 * <p>Pública dentro del módulo de ALNS (subpaquetes {@code nucleo}, {@code busquedalocal},
 * {@code operadores}) pero no forma parte del dominio compartido con IPSO.
 */
public final class Solucion {

    private final List<Ruta> rutas;
    private final List<Pedido> pedidosNoAsignados;

    public Solucion() {
        this.rutas = new ArrayList<>();
        this.pedidosNoAsignados = new ArrayList<>();
    }

    public Solucion copiar() {
        Solucion copia = new Solucion();
        for (Ruta ruta : this.rutas) {
            copia.rutas.add(copiarRuta(ruta));
        }
        copia.pedidosNoAsignados.addAll(this.pedidosNoAsignados);
        return copia;
    }

    public List<Ruta> getRutas() {
        return rutas;
    }

    public List<Pedido> getPedidosNoAsignados() {
        return pedidosNoAsignados;
    }

    public double calcularCostoTotal(double penalizacionNoAsignado) {
        double costo = 0.0;
        for (Ruta ruta : rutas) {
            costo += ruta.getCostoEstimado();
        }
        costo += pedidosNoAsignados.size() * penalizacionNoAsignado;
        return costo;
    }

    public double calcularCostoTotal() {
        return calcularCostoTotal(10000.0);
    }

    /**
     * Extrae el contrato público de esta solución, registrando cada parada planificada como
     * entrega parcial del pedido correspondiente.
     *
     * @return las rutas finales de la solución, ya con sus paradas registradas en cada pedido
     */
    public List<Ruta> aRutas() {
        for (Ruta ruta : rutas) {
            for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
                Pedido pedido = parada.getPedido();
                // Descarta las entregas planificadas de replanificaciones anteriores que nunca
                // llegaron a cumplirse (quedaron obsoletas al reemplazarse el plan): conservar
                // solo la CUMPLIDA (historial real) y la recién comprometida evita que la lista
                // crezca sin límite con cada ciclo de replanificación del mismo pedido.
                pedido.getEntregasParciales().removeIf(p -> p.getEstado() != EstadoParada.CUMPLIDA);
                pedido.getEntregasParciales().add(parada);
            }
        }
        return rutas;
    }

    public static Ruta copiarRuta(Ruta original) {
        UnidadTransporte unidad = original.getUnidadTransporte();
        Ruta copia = new Ruta(original.getIdRuta(), original.getHoraInicioPlanificada(), unidad);
        copia.setEstado(original.getEstado());
        copia.setCostoEstimado(original.getCostoEstimado());
        copia.setDuracionEstimada(original.getDuracionEstimada());
        for (ParadaPlanificada parada : original.getSecuenciaParadas()) {
            ParadaPlanificada paradaCopia = new ParadaPlanificada(parada.getPedido(), parada.getCantidadAEntregar());
            paradaCopia.setEstado(parada.getEstado());
            paradaCopia.setFechaEntregada(parada.getFechaEntregada());
            copia.getSecuenciaParadas().add(paradaCopia);
        }
        return copia;
    }
}
