package com.paqrap.entrada;

import java.time.LocalDateTime;

/**
 * Error estructurado detectado al procesar una línea de un archivo de entrada del curso.
 *
 * @param lineaOriginal contenido textual de la línea que falló
 * @param tipoError descripción breve del problema detectado
 * @param fechaDeteccion momento en que se detectó el error
 */
public record ErrorImportacion(String lineaOriginal, String tipoError, LocalDateTime fechaDeteccion) {
}
