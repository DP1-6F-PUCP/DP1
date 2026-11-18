package com.paqrap.simulador;

import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.ipso.PlanificadorIPSO;
import com.paqrap.ipso.nucleo.IPSOConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regla del curso: una unidad solo carga paquetes en un almacén. Una unidad que volvía vacía y
 * recibe una ruta nueva a mitad de camino debe pasar primero por el almacén, no salir "cargada"
 * desde la calle (observado en vivo: 80 de 170 despachos salían desde la calle).
 */
class RecargaAlmacenTest {
    private final LocalDateTime inicio = LocalDateTime.of(2026, 9, 1, 7, 0);
    private final Ciudad ciudad = new Ciudad(70, 50, new Nodo(0, 0), 1, true);
    private final ConfiguracionOperacion op = new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
    private final TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 2, 48);
    private final AlmacenCentral central = new AlmacenCentral(new Nodo(27, 14));

    private ContextoProblema contexto(List<Pedido> pedidos, UnidadTransporte... flota) {
        return new ContextoProblema(inicio, pedidos, List.of(), List.of(), List.of(central), List.of(flota), ciudad, op);
    }

    @Test void planificadorHacePasarPorElAlmacenAntesDeEntregar() {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, new Nodo(40, 14), inicio);
        Pedido pedido = new Pedido("P1", "C1", new Nodo(45, 14), 2, 24, inicio);

        List<Ruta> rutas = new PlanificadorIPSO(IPSOConfig.cargarDesde(Map.of()))
                .planificarRutas(contexto(List.of(pedido), unidad));
        Ruta ruta = rutas.stream().filter(r -> !r.getSecuenciaParadas().isEmpty()).findFirst().orElseThrow();

        assertSame(central, ruta.getAlmacenCarga());
        // 13 km hasta el central + 18 km al cliente = 31 km a 40 km/h, no los 5 km directos.
        LocalDateTime llegada = ruta.getSecuenciaParadas().get(0).getFechaEntregada();
        assertFalse(llegada.isBefore(inicio.plusMinutes(46)), "La llegada estimada incluye el viaje a cargar: " + llegada);
    }

    @Test void sobranteABordoVuelveAlStockDelAlmacenAlQueLlega(@TempDir Path logs) {
        var intermedio = new com.paqrap.dominio.AlmacenIntermedio(new Nodo(45, 14), "Este", 1000, 1000);
        intermedio.descontarStock(10, inicio); // 990: reservado por una ruta que se replanificó
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, new Nodo(40, 14), inicio);
        unidad.setCargaABordo(6); // le quedaron 6 paquetes a bordo
        unidad.setActividadActual(com.paqrap.dominio.ActividadVehiculo.VIAJANDO); // venía de una ruta abandonada
        Ruta vacia = new Ruta("R-vacia", inicio, unidad);
        unidad.agregarRuta(vacia);

        ContextoProblema ctx = new ContextoProblema(inicio, List.of(), List.of(), List.of(), List.of(central, intermedio),
                List.of(unidad), ciudad, op);
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false)).simularRutas(List.of(vacia), List.of(), ctx, 0, 2.0);

        assertEquals(intermedio.getPosicion(), unidad.getPosicion(), "Vuelve al almacén más cercano con stock");
        assertEquals(996, intermedio.getStockActual(), "Los 6 paquetes sobrantes se reponen");
        assertEquals(0, unidad.getCargaABordo());
        intermedio.reponerStock(50, inicio);
        assertEquals(1000, intermedio.getStockActual(), "Nunca supera la capacidad");
    }

    @Test void unidadReparadaEnLaCalleVuelveAlAlmacenSiNoLeAsignanNada(@TempDir Path logs) throws Exception {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, new Nodo(40, 14), inicio);
        unidad.setEstado(com.paqrap.dominio.EstadoUnidad.AVERIADO);
        unidad.setAveriaActual(new com.paqrap.dominio.Averia(com.paqrap.dominio.TipoAveria.TIPO_1, inicio.minusHours(3),
                inicio.minusMinutes(1), 2, null));
        // sa enorme: el ciclo automático no dispara solo; k da lotes de 12 min simulados.
        var orq = new OrquestadorOperacion(new PlanificadorIPSO(IPSOConfig.cargarDesde(Map.of())),
                new GestorLogSimulacion(logs.toString(), false), 1000f, 0.1f, 0.012f, 1f, contexto(List.of(), unidad), null);
        try {
            orq.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
            orq.ejecutarSiguienteLote();
            orq.ejecutarSiguienteLote();
        } finally {
            orq.detener();
        }
        assertEquals(com.paqrap.dominio.EstadoUnidad.DISPONIBLE, unidad.getEstado());
        assertNotEquals(new Nodo(40, 14), unidad.getPosicion(), "Ya no queda quieta donde se reparó");
    }

    @Test void motorCargaEnElAlmacenYRecienAhiDespacha(@TempDir Path logs) {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, new Nodo(40, 14), inicio);
        Pedido pedido = new Pedido("P1", "C1", new Nodo(45, 14), 2, 24, inicio);
        Ruta ruta = new Ruta("R1", inicio, unidad);
        ruta.getSecuenciaParadas().add(new com.paqrap.dominio.ParadaPlanificada(pedido, 2));
        ruta.programarCarga(central);
        unidad.agregarRuta(ruta);

        var motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));
        // Lote corto (0.2 h = 8 km): no alcanza a llegar al almacén, va vacía.
        motor.simularRutas(List.of(ruta), List.of(), contexto(List.of(pedido), unidad), 0, 0.2);
        assertTrue(ruta.tieneCargaPendiente());
        assertEquals(EstadoRuta.EN_EJECUCION, ruta.getEstado());
        assertEquals(0, unidad.cargaActual(), "Camino al almacén todavía no lleva paquetes");
        assertNull(ruta.getNodoDespacho(), "Aún no despachó");

        // Lote siguiente: llega al almacén, carga, sale y entrega.
        ContextoProblema siguiente = new ContextoProblema(inicio.plusMinutes(12), List.of(pedido), List.of(), List.of(),
                List.of(central), List.of(unidad), ciudad, op);
        motor.simularRutas(List.of(ruta), List.of(), siguiente, 0, 3.0);
        assertFalse(ruta.tieneCargaPendiente());
        assertEquals(central.getPosicion(), ruta.getNodoDespacho(), "El despacho se registra en el almacén");
        assertEquals(2, pedido.cantidadEntregadaTotal());
    }
}
