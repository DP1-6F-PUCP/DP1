package com.paqrap.backend.exception;

import com.paqrap.backend.dto.ApiErrorDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.util.List;

/**
 * Centraliza la traducción de excepciones a respuestas HTTP, per 61.std.java sección 4.2 y el
 * formato de error de 65.std.api sección 5.2. No expone trazas de pila en la respuesta -- solo un
 * código estable y un mensaje legible; la traza completa se registra vía SLF4J.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorDTO> manejarApiException(ApiException ex) {
        log.warn("{}: {}", ex.getCodigo(), ex.getMessage());
        return ResponseEntity.status(ex.getHttpStatus()).body(ApiErrorDTO.of(ex.getCodigo(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorDTO> manejarValidacion(MethodArgumentNotValidException ex) {
        List<ApiErrorDTO.CampoInvalidoDTO> detalles = ex.getBindingResult().getFieldErrors().stream()
                .map(this::aCampoInvalido)
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiErrorDTO.of("VALIDATION_ERROR", "La petición tiene campos inválidos", detalles));
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class,
            MultipartException.class})
    public ResponseEntity<ApiErrorDTO> manejarParametroFaltante(Exception ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiErrorDTO.of("MISSING_PARAMETER", ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorDTO> manejarArgumentoInvalido(IllegalArgumentException ex) {
        log.warn("Argumento inválido: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiErrorDTO.of("INVALID_ARGUMENT", ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorDTO> manejarGenerico(Exception ex) {
        log.error("Error no controlado", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiErrorDTO.of("INTERNAL_ERROR", "Ocurrió un error inesperado en el servidor"));
    }

    private ApiErrorDTO.CampoInvalidoDTO aCampoInvalido(FieldError error) {
        return new ApiErrorDTO.CampoInvalidoDTO(error.getField(), error.getDefaultMessage());
    }
}
