package com.paqrap.backend.dto;

import java.util.List;

/**
 * Envoltorio estándar de toda respuesta de error de la API, per 65.std.api sección 5.2:
 * {@code {"error": {"code": ..., "message": ..., "details": [...]}}}.
 */
public record ApiErrorDTO(ErrorBody error) {

    public static ApiErrorDTO of(String code, String message) {
        return new ApiErrorDTO(new ErrorBody(code, message, null));
    }

    public static ApiErrorDTO of(String code, String message, List<CampoInvalidoDTO> details) {
        return new ApiErrorDTO(new ErrorBody(code, message, details));
    }

    public record ErrorBody(String code, String message, List<CampoInvalidoDTO> details) {
    }

    public record CampoInvalidoDTO(String field, String issue) {
    }
}
