package com.paqrap.backend.dto;

/**
 * Respuesta de cada endpoint de {@code POST /api/files/*}. {@link com.paqrap.exposicion.ServicioPlanificacion#recibirArchivo}
 * es todo-o-nada: si alguna línea del archivo es inválida, rechaza el archivo completo (ver
 * {@code IllegalArgumentException} mapeada a 400 en {@code GlobalExceptionHandler}) en vez de
 * cargar parcialmente y reportar errores por línea.
 *
 * <p>Con una simulación en curso ({@code enSimulacion = true}) informa qué pasó con los pedidos:
 * cuántos entraron ya, cuántos entrarán a su hora, y cuántos NO entraron por haber ingresado antes
 * del inicio o por estar ya vencidos al subirlos. Sin simulación en curso esos conteos van en 0.
 */
public record ResultadoCargaDTO(String nombreArchivo, boolean enSimulacion, int incorporados, int programados,
        int anterioresAlInicio, int vencidos) {

    public ResultadoCargaDTO(String nombreArchivo) {
        this(nombreArchivo, false, 0, 0, 0, 0);
    }
}
