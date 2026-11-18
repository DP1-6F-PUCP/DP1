package com.paqrap.simulador;

import com.paqrap.dominio.ActividadVehiculo;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.Averia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoUnidad;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoAveria;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TrasvaseTest {
    private final LocalDateTime inicio = LocalDateTime.of(2026, 9, 1, 7, 0);
    private final Ciudad ciudad = new Ciudad(70, 50, new Nodo(0, 0), 1, true);
    private final ConfiguracionOperacion op = new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
    private final TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 2, 48);
    private final AlmacenCentral central = new AlmacenCentral(new Nodo(27, 14));

    private UnidadTransporte unidad(String id, Nodo posicion) {
        return new UnidadTransporte(id, auto, posicion, inicio);
    }

    private ContextoProblema contexto(List<Pedido> pedidos, UnidadTransporte... flota) {
        return new ContextoProblema(inicio, pedidos, List.of(), List.of(), List.of(central), List.of(flota), ciudad, op);
    }

    private void averiar(UnidadTransporte u, TipoAveria tipo) {
        u.setEstado(EstadoUnidad.AVERIADO);
        u.setAveriaActual(new Averia(tipo, inicio, op.finIndisponibilidadAveria(tipo, inicio),
                tipo == TipoAveria.TIPO_1 ? 2 : 4, tipo == TipoAveria.TIPO_1 ? null : inicio.plusHours(4)));
    }

    @Test void otraUnidadRecogeLaCargaDeLaAveriadaYEntregaAlCliente(@TempDir Path logs) {
        UnidadTransporte averiada = unidad("TA01", new Nodo(10, 0));
        UnidadTransporte rescatadora = unidad("TA02", new Nodo(0, 0));
        Pedido pedido = new Pedido("P1", "C1", new Nodo(12, 0), 2, 8, inicio.minusMinutes(30));
        averiar(averiada, TipoAveria.TIPO_2);
        averiada.agregarCargaVarada(pedido, 2);

        var vista = new PlanificadorTrasvase.ContextoProblemaVista(inicio, ciudad, List.of(), List.of(), op);
        List<Ruta> rescates = PlanificadorTrasvase.planificar(List.of(averiada, rescatadora), vista);

        assertEquals(1, rescates.size());
        Ruta rescate = rescates.get(0);
        assertSame(rescatadora, rescate.getUnidadTransporte());
        assertSame(averiada, rescate.getOrigenTrasvase());
        assertEquals(new Nodo(10, 0), rescate.getPuntoTrasvase());
        assertTrue(averiada.getCargaVarada().isEmpty(), "La carga pasa a la ruta de rescate");
        assertEquals(EstadoUnidad.EN_RUTA, rescatadora.getEstado(), "Queda ocupada para el planificador del lote");

        rescatadora.agregarRuta(rescate);
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false))
                .simularRutas(List.of(rescate), List.of(), contexto(List.of(pedido), averiada, rescatadora), 0, 2.0);

        assertFalse(rescate.tieneTrasvasePendiente());
        assertTrue(rescatadora.getTrayectoriaLote().stream()
                .anyMatch(p -> p.actividad() == ActividadVehiculo.TRASVASANDO && p.nodo().equals(new Nodo(10, 0))));
        assertEquals(2, pedido.cantidadEntregadaTotal());
    }

    @Test void unidadAveriadaSigueMostrandoSuCargaHastaQueLaRecojan() {
        UnidadTransporte averiada = unidad("TA01", new Nodo(10, 0));
        Pedido pedido = new Pedido("P1", "C1", new Nodo(12, 0), 5, 8, inicio);
        averiar(averiada, TipoAveria.TIPO_2);
        averiada.agregarCargaVarada(pedido, 5); // la avería abandonó su ruta: no tiene ruta en curso
        assertEquals(5, averiada.cargaActual(), "Los paquetes siguen a bordo: la ocupación no cae a 0");
        averiada.vaciarCargaVarada(); // trasvase o traslado al central
        assertEquals(0, averiada.cargaActual());
    }

    @Test void sinUnidadQueLlegueATiempoNoHayRescate() {
        UnidadTransporte averiada = unidad("TA01", new Nodo(60, 40));
        UnidadTransporte lejana = unidad("TA02", new Nodo(0, 0));
        // Plazo de 1 h: imposible ir 100 km, trasvasar y entregar a tiempo.
        Pedido urgente = new Pedido("P1", "C1", new Nodo(61, 40), 2, 1, inicio);
        averiar(averiada, TipoAveria.TIPO_2);
        averiada.agregarCargaVarada(urgente, 2);

        var vista = new PlanificadorTrasvase.ContextoProblemaVista(inicio, ciudad, List.of(), List.of(), op);
        assertTrue(PlanificadorTrasvase.planificar(List.of(averiada, lejana), vista).isEmpty());
        assertEquals(1, averiada.getCargaVarada().size(), "Queda a bordo; el planificador lo atiende desde un almacén");
        assertEquals(EstadoUnidad.DISPONIBLE, lejana.getEstado());
    }

    @Test void noSeRescataDeUnaUnidadYaTrasladadaAlCentral() {
        UnidadTransporte averiada = unidad("TA01", new Nodo(10, 0));
        UnidadTransporte rescatadora = unidad("TA02", new Nodo(0, 0));
        Pedido pedido = new Pedido("P1", "C1", new Nodo(12, 0), 2, 8, inicio);
        averiar(averiada, TipoAveria.TIPO_3);
        averiada.agregarCargaVarada(pedido, 2);

        var despuesDelTraslado = new PlanificadorTrasvase.ContextoProblemaVista(inicio.plusHours(5), ciudad,
                List.of(), List.of(), op);
        assertTrue(PlanificadorTrasvase.planificar(List.of(averiada, rescatadora), despuesDelTraslado).isEmpty());
    }

    @Test void unidadEnMantenimientoVuelveAlAlmacenCentral(@TempDir Path logs) {
        UnidadTransporte unidad = unidad("TA01", new Nodo(10, 0));
        unidad.setEstado(EstadoUnidad.EN_MANTENIMIENTO);
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false))
                .simularRutas(List.of(), List.of(), contexto(List.of(), unidad), 0, 2.0);
        assertEquals(central.getPosicion(), unidad.getPosicion());
        assertEquals(ActividadVehiculo.INACTIVO, unidad.getActividadActual());
    }
}
