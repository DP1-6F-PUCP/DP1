package com.paqrap.alns;

import java.time.Duration;
import java.time.LocalDateTime;

/** Utilidades de aritmética horaria compartidas por el evaluador y el verificador de restricciones de ALNS. */
final class TiempoUtil {

    private TiempoUtil() {
    }

    static LocalDateTime sumarHoras(LocalDateTime instante, double horas) {
        return instante.plusSeconds(Math.round(horas * 3600.0));
    }

    static double horasEntre(LocalDateTime desde, LocalDateTime hasta) {
        return Duration.between(desde, hasta).toSeconds() / 3600.0;
    }
}
