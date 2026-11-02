package com.paqrap.simulador;

import com.paqrap.dominio.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AveriasPermanenciaTest {

    @Test
    void averiasTipo2Y3Permanecen4HorasEnSitioAntesDeTrasladoInstantaneoAlAlmacenCentral(@TempDir Path logs) {
        var config = new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
        var t0 = LocalDateTime.of(2026, 1, 1, 8, 0);

        // Reglas de fin de indisponibilidad por tipo de avería
        assertEquals(t0.plusHours(2), config.finIndisponibilidadAveria(TipoAveria.TIPO_1, t0));
        assertEquals(LocalDateTime.of(2026, 1, 1, 23, 0), config.finIndisponibilidadAveria(TipoAveria.TIPO_2, t0));
        assertEquals(LocalDateTime.of(2026, 1, 3, 15, 0), config.finIndisponibilidadAveria(TipoAveria.TIPO_3, t0));

        var tipoAuto = new TipoVehiculo("AUTO", "Automóvil", 25, 50.0, 1.0, 1, 2.0);
        var posAveria = new Nodo(44, 28);
        var posCentral = new Nodo(12, 8);
        Almacen central = new AlmacenCentral(posCentral);
        var unidad = new UnidadTransporte("TA01", tipoAuto, posAveria, t0);
        unidad.setEstado(EstadoUnidad.AVERIADO);
        unidad.setActividadActual(ActividadVehiculo.INACTIVO);
        unidad.setAveriaActual(new Averia(
                TipoAveria.TIPO_2,
                t0,
                config.finIndisponibilidadAveria(TipoAveria.TIPO_2, t0),
                4,
                t0.plusHours(4)));

        var motor = new MotorSimulacion(new GestorLogSimulacion(logs.toString(), false));

        // Lote 08:00 a 10:00 (2h < 4h): permanece en el sitio de la avería
        var ctx1 = new ContextoProblema(t0, List.of(), List.of(), List.of(), List.of(central), List.of(unidad),
                new Ciudad(70, 50, posCentral, 1, true), config);
        motor.simularRutas(List.of(), List.of(), ctx1, 0.0, 2.0);
        assertEquals(posAveria, unidad.getPosicion());

        // Lote 10:00 a 13:00 (cruza las 12:00 = t0 + 4h): traslado instantáneo al Almacén Central
        var ctx2 = new ContextoProblema(t0.plusHours(2), List.of(), List.of(), List.of(), List.of(central), List.of(unidad),
                new Ciudad(70, 50, posCentral, 1, true), config);
        motor.simularRutas(List.of(), List.of(), ctx2, 2.0, 3.0);
        assertEquals(posCentral, unidad.getPosicion());

        var tr = unidad.getTrayectoriaLote();
        boolean tieneSaltoInstantaneoEn12 = false;
        for (int i = 0; i + 1 < tr.size(); i++) {
            var a = tr.get(i);
            var b = tr.get(i + 1);
            if (a.instante().equals(t0.plusHours(4)) && b.instante().equals(t0.plusHours(4))
                    && a.nodo().equals(posAveria) && b.nodo().equals(posCentral)) {
                tieneSaltoInstantaneoEn12 = true;
                break;
            }
        }
        assertTrue(tieneSaltoInstantaneoEn12);
    }
}
