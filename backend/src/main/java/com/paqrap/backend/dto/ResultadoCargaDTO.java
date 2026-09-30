package com.paqrap.backend.dto;

/**
 * Respuesta de cada endpoint de {@code POST /api/files/*}. {@link com.paqrap.exposicion.ServicioPlanificacion#recibirArchivo}
 * es todo-o-nada: si alguna línea del archivo es inválida, rechaza el archivo completo (ver
 * {@code IllegalArgumentException} mapeada a 400 en {@code GlobalExceptionHandler}) en vez de
 * cargar parcialmente y reportar errores por línea.
 */
public record ResultadoCargaDTO(String nombreArchivo) {
}
