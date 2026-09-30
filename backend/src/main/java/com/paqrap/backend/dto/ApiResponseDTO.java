package com.paqrap.backend.dto;

import java.time.Instant;

/**
 * Envoltorio estándar de toda respuesta exitosa de la API, per 65.std.api sección 5.1:
 * {@code {"data": {...}, "meta": {"timestamp": ...}}}.
 */
public record ApiResponseDTO<T>(T data, MetaDTO meta) {

    public static <T> ApiResponseDTO<T> of(T data) {
        return new ApiResponseDTO<>(data, new MetaDTO(Instant.now()));
    }

    public record MetaDTO(Instant timestamp) {
    }
}
