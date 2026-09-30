package com.paqrap.backend.exception;

import org.springframework.http.HttpStatus;

/** El archivo recibido en {@code /api/files/*} no pudo leerse (adjunto corrupto, vacío, etc.). */
public class ArchivoIlegibleException extends ApiException {

    public ArchivoIlegibleException(String nombreArchivo, Throwable causa) {
        super("ARCHIVO_ILEGIBLE", HttpStatus.BAD_REQUEST,
                "No se pudo leer el archivo '" + nombreArchivo + "': " + causa.getMessage());
        initCause(causa);
    }
}
