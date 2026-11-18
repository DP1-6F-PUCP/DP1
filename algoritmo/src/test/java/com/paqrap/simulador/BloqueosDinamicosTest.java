package com.paqrap.simulador;

import com.paqrap.dominio.*;
import com.paqrap.exposicion.EnsambladorRespuestas;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class BloqueosDinamicosTest {
    private final LocalDateTime inicio = LocalDateTime.of(2026, 1, 1, 0, 0);
    private final Ciudad ciudad = new Ciudad(12, 12, new Nodo(0, 0), 1, true);
    private Bloqueo bloqueo(LocalDateTime desde, LocalDateTime hasta) {
        return new Bloqueo(List.of(new Nodo(2, 3), new Nodo(7, 3)), desde, hasta);
    }
    private ContextoProblema contexto(UnidadTransporte unidad, List<Bloqueo> bloqueos, List<Pedido> pedidos) {
        return new ContextoProblema(inicio, pedidos, bloqueos, List.of(), List.of(), List.of(unidad), ciudad,
                new ConfiguracionOperacion(8, 7, 0.01, 1, 1, 0, 0.5, 2));
    }
    private UnidadTransporte unidad(Nodo nodo) {
        return new UnidadTransporte("TA01", new TipoVehiculo("AUTO", "Auto", 24, 60, 8, 1, 48), nodo,
                inicio.minusHours(1));
    }
    private Pedido pedido(String id, Nodo destino) {
        return new Pedido(id, "cliente", destino, 1, 12, inicio);
    }
    private Ruta ruta(UnidadTransporte unidad, Pedido... pedidos) {
        Ruta ruta = new Ruta("ruta", inicio, unidad);
        for (Pedido p : pedidos) ruta.getSecuenciaParadas().add(new ParadaPlanificada(p, 1));
        return ruta;
    }
    @Test void rodeaBloqueoYEntregaSoloPorAccesoPerpendicular() {
        Bloqueo b = bloqueo(inicio, inicio.plusHours(2));
        List<Nodo> rodeo = CalculadorDistancia.caminoMasCorto(ciudad, List.of(b), inicio, new Nodo(4, 1), new Nodo(4, 5));
        assertTrue(rodeo.stream().noneMatch(b.getSecuenciaNodos()::contains));
        for (Nodo destino : List.of(new Nodo(4, 3), new Nodo(2, 3), new Nodo(7, 3))) {
            List<Nodo> acceso = CalculadorDistancia.caminoMasCorto(ciudad, List.of(b), inicio, new Nodo(0, 3), destino);
            Nodo previo = acceso.get(acceso.size() - 2);
            assertEquals(destino.x(), previo.x(), "No entrar por prolongación paralela del extremo");
            assertNotEquals(destino.y(), previo.y());
        }
    }
    @Test void desviaAlActivarseDentroDelViaje(@TempDir Path logs) {
        UnidadTransporte u = unidad(new Nodo(4, 0));
        Pedido p = pedido("p", new Nodo(4, 6));
        Bloqueo b = bloqueo(inicio.plusSeconds(90), inicio.plusHours(2));
        ContextoProblema c = contexto(u, List.of(b), List.of(p));
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false))
                .simularRutas(List.of(ruta(u, p)), List.of(), c, 0, 0.3);
        assertEquals(1, p.cantidadEntregadaTotal());
        assertTrue(u.getTrayectoriaLote().stream().noneMatch(pt -> b.estaVigente(pt.instante())
                && b.getSecuenciaNodos().contains(pt.nodo())), "No debe cruzar el bloqueo perpendicularmente para pasar al otro lado");
    }
    @Test void evitaBloqueoQueEmpiezaDuranteUnaCuadra(@TempDir Path logs) {
        UnidadTransporte u = unidad(new Nodo(4, 2));
        Pedido p = pedido("p", new Nodo(4, 5));
        Bloqueo b = bloqueo(inicio.plusSeconds(30), inicio.plusHours(2));
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false))
                .simularRutas(List.of(ruta(u, p)), List.of(), contexto(u, List.of(b), List.of(p)), 0, 0.3);
        assertTrue(u.getTrayectoriaLote().stream().noneMatch(pt -> b.getSecuenciaNodos().contains(pt.nodo())));
        assertEquals(1, p.cantidadEntregadaTotal());
    }
    @Test void salePorElMismoAccesoInclusoEnOtroLote(@TempDir Path logs) {
        UnidadTransporte u = unidad(new Nodo(4, 2));
        Pedido primero = pedido("primero", new Nodo(4, 3));
        Pedido segundo = pedido("segundo", new Nodo(4, 5));
        Bloqueo b = bloqueo(inicio, inicio.plusHours(2));
        ContextoProblema c = contexto(u, List.of(b), List.of(primero, segundo));
        Ruta r = ruta(u, primero, segundo);
        MotorSimulacion motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));
        motor.simularRutas(List.of(r), List.of(), c, 0, 0.02);
        assertEquals(new Nodo(4, 3), u.getPosicion());
        assertEquals(ActividadVehiculo.ENTREGANDO, u.getActividadActual());
        var siguiente = new ContextoProblema(inicio.plusSeconds(72), c.pedidos(), c.bloqueos(), c.mantenimientos(),
                c.almacenes(), c.vehiculos(), ciudad, c.configuracionOperacion());
        motor.simularRutas(List.of(r), List.of(), siguiente, 0, 0.3);
        var salida = u.getTrayectoriaLote().stream().filter(pt -> !pt.nodo().equals(new Nodo(4, 3))).findFirst().orElseThrow();
        assertEquals(new Nodo(4, 2), salida.nodo(), "Salir por el lado por el que llegó, sin atravesar el cierre");
        assertEquals(1, segundo.cantidadEntregadaTotal());
    }
    @Test void publicaBloqueosQueVencenDentroDelLote() {
        var c = contexto(unidad(new Nodo(0, 0)), List.of(bloqueo(inicio, inicio.plusMinutes(5))), List.of());
        var fin = new ContextoProblema(inicio.plusMinutes(10), c.pedidos(), c.bloqueos(), c.mantenimientos(),
                c.almacenes(), c.vehiculos(), ciudad, c.configuracionOperacion());
        var dto = EnsambladorRespuestas.ensamblarEstado(fin, List.of(), List.of(), inicio, new ReporteDesempeno());
        assertEquals(1, dto.bloqueos().size());
        assertFalse(dto.bloqueos().get(0).vigente());
    }
    @Test void esperaSiNoExisteDesvio(@TempDir Path logs) {
        UnidadTransporte u = unidad(new Nodo(0, 5));
        Pedido p = pedido("sin-acceso", new Nodo(2, 5));
        Bloqueo pared = new Bloqueo(List.of(new Nodo(1, 0), new Nodo(1, 12)), inicio, inicio.plusHours(2));
        new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false))
                .simularRutas(List.of(ruta(u, p)), List.of(), contexto(u, List.of(pared), List.of(p)), 0, 0.3);
        assertEquals(new Nodo(0, 5), u.getPosicion());
        assertEquals(0, p.cantidadEntregadaTotal());
    }
    @Test void bloqueoNuevoQueNoTocaElCaminoMantieneLaRuta(@TempDir Path logs) throws Exception {
        UnidadTransporte u = unidad(new Nodo(0, 0));
        Pedido p = pedido("en-ruta", new Nodo(10, 0)); // camino por y=0; el bloqueo está en y=3
        Ruta original = ruta(u, p);
        AtomicInteger llamadas = new AtomicInteger();
        Planificador planificador = c -> {
            if (llamadas.getAndIncrement() == 0) return List.of(original);
            assertFalse(c.pedidos().contains(p), "Un bloqueo lejano no debe quitarle el pedido a su ruta");
            return List.of();
        };
        var c = contexto(u, List.of(bloqueo(inicio.plusSeconds(30), inicio.plusHours(2))), List.of(p));
        var runner = new OrquestadorOperacion(planificador, new GestorLogSimulacion(logs.toString(), false),
                1000f, 0.1f, 0.012f, 1f, c, null);
        try {
            runner.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
            runner.ejecutarSiguienteLote();
            runner.ejecutarSiguienteLote();
            assertTrue(llamadas.get() >= 2);
            assertNotEquals(EstadoRuta.REEMPLAZADA, original.getEstado());
        } finally { runner.detener(); }
    }
    @Test void nuevoBloqueoDevuelvePedidosEnRutaAlPlanificador(@TempDir Path logs) throws Exception {
        UnidadTransporte u = unidad(new Nodo(4, 0));
        Pedido p = pedido("en-ruta", new Nodo(4, 6)); // su camino cruza el bloqueo en (4,3)
        Ruta original = ruta(u, p);
        AtomicInteger llamadas = new AtomicInteger();
        CountDownLatch primerLote = new CountDownLatch(1);
        Planificador planificador = c -> {
            if (llamadas.getAndIncrement() == 0) return List.of(original);
            assertTrue(c.pedidos().contains(p), "El pedido en curso debe volver a competir con los pendientes");
            return List.of(ruta(u, p));
        };
        var c = contexto(u, List.of(bloqueo(inicio.plusSeconds(30), inicio.plusHours(2))), List.of(p));
        var runner = new OrquestadorOperacion(planificador, new GestorLogSimulacion(logs.toString(), false),
                1f, 0.1f, 1f, 1f, c, null);
        runner.setAlCerrarLote(() -> {
            if (runner.getContextoProblema().marcaTiempoActual().isAfter(inicio)) primerLote.countDown();
        });
        try {
            runner.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
            assertTrue(primerLote.await(5, TimeUnit.SECONDS));
            assertEquals(EstadoRuta.EN_EJECUCION, original.getEstado());
            runner.ejecutarSiguienteLote();
            assertEquals(2, llamadas.get());
            assertEquals(EstadoRuta.REEMPLAZADA, original.getEstado());
        } finally { runner.detener(); }
    }

    @Test void ipsoPlanificaParadaEnEsquinaCuyoBloqueoVenceDuranteLaRuta() {
        LocalDateTime ahora = LocalDateTime.of(2026, 11, 17, 21, 10);
        Ciudad ciudad = new Ciudad(70, 50, new Nodo(0, 0), 1, true);
        ConfiguracionOperacion op = new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
        TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 1, 48);
        UnidadTransporte unidad = new UnidadTransporte("TA01", auto, new Nodo(27, 14),
                LocalDateTime.of(2026, 11, 17, 15, 0));
        unidad.setRefrigerioTomado(true);
        unidad.setTiempoInicioTurnoActual(LocalDateTime.of(2026, 11, 17, 15, 0));

        // Bloqueo en L con esquina en (20, 35) vigente de 19:24 a 21:57 (expira antes de la 2da parada)
        Bloqueo bloqueoEsquina = new Bloqueo(
                List.of(new Nodo(15, 25), new Nodo(15, 30), new Nodo(20, 30),
                        new Nodo(20, 35), new Nodo(30, 35), new Nodo(30, 40)),
                LocalDateTime.of(2026, 11, 17, 19, 24),
                LocalDateTime.of(2026, 11, 17, 21, 57));

        Pedido primero = new Pedido("P1", "C1", new Nodo(24, 41), 2, 4, ahora.minusMinutes(10));
        Pedido segundo = new Pedido("P2", "C2", new Nodo(20, 35), 2, 4, ahora.minusMinutes(5));
        ContextoProblema ctx = new ContextoProblema(ahora, List.of(primero, segundo), List.of(bloqueoEsquina),
                List.of(), List.of(new AlmacenCentral(new Nodo(27, 14))), List.of(unidad), ciudad, op);

        var planificador = new com.paqrap.ipso.PlanificadorIPSO(new com.paqrap.ipso.nucleo.IPSOConfig());
        List<Ruta> rutas = assertDoesNotThrow(() -> planificador.planificarRutas(ctx));
        assertEquals(1, rutas.size());
        assertEquals(List.of("P1", "P2"),
                rutas.get(0).getSecuenciaParadas().stream().map(p -> p.getPedido().getIdPedido()).toList());
    }
}
