package com.paqrap.simulador;

import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
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

/** El costo reportado es el de los km recorridos, no el estimado al planificar. */
class CostoRecorridoTest {
    private final LocalDateTime inicio = LocalDateTime.of(2026, 9, 1, 7, 0);
    private final Ciudad ciudad = new Ciudad(70, 50, new Nodo(0, 0), 1, true);
    private final ConfiguracionOperacion op = new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
    private final TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 2, 48);
    private final AlmacenCentral central = new AlmacenCentral(new Nodo(27, 14));

    private ContextoProblema contexto(LocalDateTime t, List<Pedido> pedidos, UnidadTransporte unidad) {
        return new ContextoProblema(t, pedidos, List.of(), List.of(), List.of(central), List.of(unidad), ciudad, op);
    }

    private Ruta ruta(String id, UnidadTransporte unidad, Pedido pedido) {
        Ruta ruta = new Ruta(id, inicio, unidad);
        ruta.getSecuenciaParadas().add(new ParadaPlanificada(pedido, 2));
        ruta.setCostoEstimado(99_999); // no debe influir
        unidad.agregarRuta(ruta);
        return ruta;
    }

    @Test void idaEntregaYRegresoCuestanLoRecorrido(@TempDir Path logs) {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, central.getPosicion(), inicio);
        Pedido pedido = new Pedido("P1", "C1", new Nodo(37, 14), 2, 24, inicio); // a 10 km
        var motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));

        motor.simularRutas(List.of(ruta("R1", unidad, pedido)), List.of(), contexto(inicio, List.of(pedido), unidad), 0, 4.0);

        assertEquals(2, pedido.cantidadEntregadaTotal());
        assertEquals(central.getPosicion(), unidad.getPosicion());
        assertEquals(20 * 8.0, motor.getCostoRecorrido(), 1e-6, "10 km de ida y 10 de regreso a S/ 8");
    }

    @Test void partirElViajeEnLotesNoCambiaElTotal(@TempDir Path logs) {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, central.getPosicion(), inicio);
        Pedido pedido = new Pedido("P1", "C1", new Nodo(37, 14), 2, 24, inicio);
        Ruta ruta = ruta("R1", unidad, pedido);
        var motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));
        double total = 0;
        // Lotes de 0,11 h: cortan a mitad de cuadra (a 40 km/h una cuadra son 0,025 h).
        for (int i = 0; i < 40; i++) {
            Ruta actual = ruta.getEstado() == EstadoRuta.FINALIZADA ? new Ruta("V" + i, inicio, unidad) : ruta;
            motor.simularRutas(List.of(actual), List.of(),
                    contexto(inicio.plusSeconds(i * 396L), List.of(pedido), unidad), 0, 0.11);
            total += motor.getCostoRecorrido();
        }
        assertEquals(central.getPosicion(), unidad.getPosicion());
        assertEquals(20 * 8.0, total, 1e-6);
    }

    @Test void rutaAbandonadaSoloCuestaLoQueAvanzo(@TempDir Path logs) {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, central.getPosicion(), inicio);
        Pedido lejos = new Pedido("P1", "C1", new Nodo(67, 14), 2, 24, inicio); // a 40 km
        Ruta primera = ruta("R1", unidad, lejos);
        var motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));
        motor.simularRutas(List.of(primera), List.of(), contexto(inicio, List.of(lejos), unidad), 0, 0.5);
        double avance = motor.getCostoRecorrido();
        int km = Math.abs(unidad.getPosicion().x() - 27) + Math.abs(unidad.getPosicion().y() - 14);

        assertTrue(km > 0 && km < 40, "Va a mitad de camino: " + km);
        assertEquals(km * 8.0, avance, 1e-6);
    }

    @Test void elReporteAcumulaLoRecorridoYNoElEstimado(@TempDir Path logs) throws Exception {
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, central.getPosicion(), inicio);
        Pedido pedido = new Pedido("P1", "C1", new Nodo(37, 14), 2, 24, inicio);
        // sa enorme: el ciclo automático no dispara solo; k da lotes de 12 min simulados.
        var orq = new OrquestadorOperacion(new PlanificadorIPSO(IPSOConfig.cargarDesde(Map.of())),
                new GestorLogSimulacion(logs.toString(), false), 1000f, 0.1f, 0.012f, 1f,
                contexto(inicio, List.of(pedido), unidad), null);
        try {
            orq.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
            for (int i = 0; i < 25; i++) {
                orq.ejecutarSiguienteLote();
            }
        } finally {
            orq.detener();
        }
        assertEquals(2, pedido.cantidadEntregadaTotal());
        assertEquals(central.getPosicion(), unidad.getPosicion());
        assertEquals(20 * 8.0, orq.getReporte().getCostoTotalAcumulado(), 1e-3);
    }
}
