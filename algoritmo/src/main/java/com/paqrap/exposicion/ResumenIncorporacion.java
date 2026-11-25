package com.paqrap.exposicion;

/**
 * Qué pasó con los pedidos de un archivo subido con una simulación en curso.
 *
 * @param incorporados entraron de inmediato (su ingreso ya llegó en el reloj simulado)
 * @param programados entrarán cuando el reloj simulado llegue a su hora de ingreso
 * @param anterioresAlInicio ingresaron antes del inicio de la simulación: no se incorporan
 * @param vencidos su plazo ya había pasado al subirlos: no se incorporan (si entraran, la simulación
 *         los daría por incumplidos al instante y se detendría por algo que el operador no pudo evitar)
 */
public record ResumenIncorporacion(int incorporados, int programados, int anterioresAlInicio, int vencidos) {

    public static final ResumenIncorporacion VACIO = new ResumenIncorporacion(0, 0, 0, 0);
}
