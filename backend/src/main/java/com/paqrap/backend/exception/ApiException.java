package com.paqrap.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * Base de las excepciones de negocio de la API, per 61.std.java sección 4.1: excepciones
 * específicas por caso de negocio, no verificadas (unchecked) para no contaminar las firmas de
 * los servicios/controladores con cláusulas {@code throws}.
 */
public abstract class ApiException extends RuntimeException {

    private final String codigo;
    private final HttpStatus httpStatus;

    protected ApiException(String codigo, HttpStatus httpStatus, String mensaje) {
        super(mensaje);
        this.codigo = codigo;
        this.httpStatus = httpStatus;
    }

    public String getCodigo() {
        return codigo;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
