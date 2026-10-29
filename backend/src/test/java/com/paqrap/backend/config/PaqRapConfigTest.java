package com.paqrap.backend.config;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.nio.file.Files;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
class PaqRapConfigTest {
    @Test void encuentraDatosDeEneroEnElModuloAlgoritmo() throws Exception {
        var carga = new PaqRapConfig().cargadorRecursos("data").cargarPedidos(2026, 1);
        assertFalse(carga.getPedidos().isEmpty());
        assertEquals(LocalDateTime.of(2026,1,1,1,30), carga.getPedidos().get(0).getFechaIngreso());
    }
    @Test void respetaRutaConfigurada(@TempDir Path temporal) throws Exception {
        Files.createDirectories(temporal.resolve("ventas"));
        Files.writeString(temporal.resolve("ventas/ventas.202601.txt"), "01d02h15m:56,30,c4910,02,36\n");
        var carga = new PaqRapConfig().cargadorRecursos(temporal.toString()).cargarPedidos(2026,1);
        assertEquals(1,carga.getPedidos().size());
        assertEquals(LocalDateTime.of(2026,1,1,2,15),carga.getPedidos().get(0).getFechaIngreso());
    }
}
