package com.paqrap.exposicion;

import com.paqrap.dominio.*;
import com.paqrap.simulador.TipoEscenario;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class ReporteSimulacionTest {
    private final LocalDateTime inicio = LocalDateTime.of(2026, 1, 1, 0, 0);
    private ServicioPlanificacionImpl servicio(Path logs) {
        return new ServicioPlanificacionImpl(new Ciudad(10, 10, new Nodo(0, 0), 1, true),
                new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2), List.of(),
                List.of(new AlmacenCentral(new Nodo(0, 0))), new ArrayList<>(), TipoAlgoritmo.IPSO,
                Map.of(), logs.toString(), null);
    }
    private ReporteSimulacionDTO esperarReporte(ServicioPlanificacionImpl servicio, String id) throws Exception {
        long limite = System.nanoTime() + 5_000_000_000L;
        while (System.nanoTime() < limite) {
            try { return servicio.consultarReporteFinal(id); }
            catch (IllegalStateException pendiente) { Thread.sleep(10); }
        }
        throw new AssertionError("No se publicó el reporte final");
    }
    @Test void colapsoConservaElLoteEstableYElPedidoQueFallo(@TempDir Path logs) throws Exception {
        var servicio = servicio(logs);
        servicio.recibirArchivo(new ArchivoEntrada("ventas.202601.txt", "01d00h00m:4,4,c1,1,1"));
        var ejecucion = servicio.seleccionarEscenario(TipoEscenario.COLAPSO_LOGISTICO, inicio,
                .001f, .0001f, 60_000f, 1f, List.of());
        try {
            var reporte = esperarReporte(servicio, ejecucion.getIdEjecucion());
            assertEquals("COLAPSO", reporte.motivoFinalizacion());
            assertEquals(inicio.plusHours(2), reporte.finSimulado());
            assertEquals(7_200_000L, reporte.duracionSimuladaMs());
            assertEquals(inicio.plusHours(1), reporte.ultimaPlanificacionEstable().marcaTiempoActual());
            assertEquals("PENDIENTE", reporte.pedidosPlanificacionEstable().get(0).estado());
            assertEquals("INCUMPLIDA", reporte.pedidosFinales().get(0).estado());
            assertNotNull(reporte.finReal());
            assertTrue(reporte.duracionRealMs() >= 0);
        } finally { servicio.detenerEjecucion(ejecucion.getIdEjecucion()); }
    }
    @Test void pararEnDiaADiaCongelaElReporteAunqueSeInicieOtroEscenario(@TempDir Path logs) throws Exception {
        var servicio = servicio(logs);
        var ejecucion = servicio.seleccionarEscenario(TipoEscenario.DIA_A_DIA, inicio,
                1f, .1f, 1f, 1f, List.of());
        try {
            long limite = System.nanoTime() + 5_000_000_000L;
            while (!servicio.consultarEstadoOperacion().marcaTiempoActual().isAfter(inicio)
                    && System.nanoTime() < limite) Thread.sleep(10);
            assertTrue(servicio.consultarEstadoOperacion().marcaTiempoActual().isAfter(inicio));
            servicio.detenerEjecucion(ejecucion.getIdEjecucion());
            var reporte = servicio.consultarReporteFinal(ejecucion.getIdEjecucion());
            assertEquals("PARADA_MANUAL", reporte.motivoFinalizacion());
            assertEquals("DIA_A_DIA", reporte.tipoEscenario());
            assertEquals(inicio.plusMinutes(1), reporte.finSimulado());
            var otra = servicio.seleccionarEscenario(TipoEscenario.CINCO_DIAS, inicio.plusMonths(1),
                    1f, .1f, 1f, 1f, List.of());
            try { assertSame(reporte, servicio.consultarReporteFinal(ejecucion.getIdEjecucion())); }
            finally { servicio.detenerEjecucion(otra.getIdEjecucion()); }
        } finally {
            var activa = servicio.consultarEjecucionActiva();
            if (activa != null) servicio.detenerEjecucion(activa.getIdEjecucion());
        }
    }
    @Test void completarPeriodoProduceReporteSinPedidoFallido(@TempDir Path logs) throws Exception {
        var servicio = servicio(logs);
        var ejecucion = servicio.seleccionarEscenario(TipoEscenario.CINCO_DIAS, inicio,
                .001f, .0001f, 7_200_000f, 1f, List.of());
        try {
            var reporte = esperarReporte(servicio, ejecucion.getIdEjecucion());
            assertEquals("PERIODO_COMPLETADO", reporte.motivoFinalizacion());
            assertEquals(inicio.plusDays(5), reporte.finSimulado());
            assertEquals(5L * 86400_000, reporte.duracionSimuladaMs());
            assertTrue(reporte.pedidosFinales().isEmpty());
            assertNotNull(reporte.ultimaPlanificacionEstable());
        } finally { servicio.detenerEjecucion(ejecucion.getIdEjecucion()); }
    }
}
