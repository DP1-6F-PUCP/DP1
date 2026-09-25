package com.paqrap.experimentacion;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Entorno físico estándar (ciudad, almacenes, flota) compartido por todos los experimentos de
 * este módulo, para que cada corrida parta exactamente del mismo escenario base y las diferencias
 * observadas se deban solo al factor que se está estudiando (algoritmo o hiperparámetros).
 */
final class EntornoEstandar {

    /**
     * Cantidad fija de pedidos por instancia, en vez de "los primeros N días del mes": los datos
     * oficiales del curso muestran una tasa de llegada que se acelera progresivamente a lo largo
     * de los 3 años disponibles (ej. los primeros 3 días de enero 2026 traen ~40 pedidos, los de
     * enero 2028 traen ~1749 — el dataset modela la demanda creciente hacia el colapso logístico
     * del enunciado). Recortar por días de calendario mezclaría el tamaño de la instancia con el
     * efecto que se quiere estudiar; recortar por cantidad fija de pedidos (los primeros N en
     * orden cronológico del archivo) mantiene el tamaño de instancia controlado entre bloques.
     */
    static final int PEDIDOS_POR_INSTANCIA = 45;

    private EntornoEstandar() {
    }

    static List<Pedido> primerosPedidos(List<Pedido> todos) {
        return todos.stream().limit(PEDIDOS_POR_INSTANCIA).toList();
    }

    /**
     * Filtra los bloqueos a los realmente relevantes para el horizonte de esta instancia (desde
     * el primer pedido hasta 48h después del último), en vez de pasar el mes completo.
     *
     * <p>Corrige un cuello de botella real de rendimiento: {@code CalculadorDistancia} usa BFS
     * (en vez de la fórmula Manhattan O(1)) para <em>toda</em> consulta de distancia apenas exista
     * algún bloqueo vigente en el instante consultado — sin importar si ese bloqueo está cerca de
     * la ruta evaluada. Con ~600-700 bloqueos por mes y ventanas de pocas horas cada uno, casi
     * cualquier instante del mes completo cae dentro de la ventana de alguno, forzando BFS de
     * forma casi permanente. Como esta instancia de planificación solo cubre unas pocas horas o
     * días, los bloqueos de semanas más adelante en el mes son irrelevantes para ella de todas
     * formas — filtrarlos es tanto una corrección de rendimiento como de alcance correcto.
     */
    static List<Bloqueo> bloqueosRelevantes(List<Bloqueo> bloqueos, List<Pedido> pedidos) {
        if (pedidos.isEmpty()) {
            return List.of();
        }
        LocalDateTime desde = pedidos.get(0).getFechaIngreso();
        LocalDateTime hasta = pedidos.get(pedidos.size() - 1).getFechaIngreso().plusHours(48);
        return bloqueos.stream()
                .filter(b -> !b.getFechaFin().isBefore(desde) && !b.getFechaInicio().isAfter(hasta))
                .toList();
    }

    static Ciudad ciudad() {
        return new Ciudad(70, 50, new Nodo(0, 0), 1, true);
    }

    static ConfiguracionOperacion operacion() {
        // (duracionTurnoHoras, horaInicioTurno, tiempoServicioClienteHoras, duracionRefrigerioHoras,
        //  margenRefrigerioHoras, tiempoCargaAlmacenHoras, tiempoTrasvaseHoras)
        return new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5);
    }

    static List<Almacen> almacenes() {
        return List.of(
                new AlmacenCentral(new Nodo(27, 14)),
                new AlmacenIntermedio(new Nodo(12, 38), "Nor-Oeste", 1000, 1000),
                new AlmacenIntermedio(new Nodo(57, 27), "Este", 1000, 1000));
    }

    /** Misma composición de flota que usaba el demo original del curso: 10 autos, 15 motos, 12 bicicletas. */
    static List<UnidadTransporte> flota() {
        TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 10, 48);
        TipoVehiculo moto = new TipoVehiculo("MOTO", "Moto", 8, 25.0, 6.0, 15, 24);
        TipoVehiculo bici = new TipoVehiculo("BICI", "Bicicleta", 4, 12.0, 3.0, 12, 8);
        Nodo central = new Nodo(27, 14);
        LocalDateTime inicioTurno = LocalDateTime.of(2026, 1, 1, 7, 0);

        List<UnidadTransporte> flota = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            flota.add(new UnidadTransporte(String.format("TA%02d", i), auto, central, inicioTurno));
        }
        for (int i = 1; i <= 15; i++) {
            flota.add(new UnidadTransporte(String.format("TM%02d", i), moto, central, inicioTurno));
        }
        for (int i = 1; i <= 12; i++) {
            flota.add(new UnidadTransporte(String.format("TB%02d", i), bici, central, inicioTurno));
        }
        return flota;
    }

    /** Copia defensiva de pedidos: cada corrida necesita instancias frescas de {@link Pedido}, ya que ambos
     * algoritmos mutan su estado (entregasParciales, estado) y no deben contaminarse entre corridas. */
    static List<Pedido> clonarPedidos(List<Pedido> original) {
        List<Pedido> copia = new ArrayList<>();
        for (Pedido p : original) {
            copia.add(new Pedido(p.getIdPedido(), p.getIdCliente(), p.getDestino(), p.getCantidadSolicitada(),
                    p.getHorasLimite(), p.getFechaIngreso()));
        }
        return copia;
    }
}
