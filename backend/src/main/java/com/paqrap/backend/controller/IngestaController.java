package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.backend.dto.ResultadoCargaDTO;
import com.paqrap.backend.exception.ArchivoIlegibleException;
import com.paqrap.exposicion.ArchivoEntrada;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Ingesta de los 3 archivos oficiales del curso (pedidos, bloqueos, mantenimiento) recibidos por
 * HTTP -- delega íntegramente a {@link ServicioPlanificacion#recibirArchivo}, el puerto de entrada
 * ya diseñado para esto (infiere {@link com.paqrap.dominio.TipoArchivo} y el período del propio
 * nombre del archivo, y alimenta el mismo estado que luego usan {@code seleccionarEscenario} y
 * {@code consultarPedidos}) -- no se reimplementa el parseo aquí.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class IngestaController {

    private final ServicioPlanificacion servicioPlanificacion;

    @PostMapping("/api/files/orders")
    public ApiResponseDTO<ResultadoCargaDTO> cargarPedidos(@RequestParam("file") MultipartFile file) {
        return recibir(file);
    }

    @PostMapping("/api/files/blocked-streets")
    public ApiResponseDTO<ResultadoCargaDTO> cargarBloqueos(@RequestParam("file") MultipartFile file) {
        return recibir(file);
    }

    @PostMapping("/api/files/maintenance")
    public ApiResponseDTO<ResultadoCargaDTO> cargarMantenimiento(@RequestParam("file") MultipartFile file) {
        return recibir(file);
    }

    private ApiResponseDTO<ResultadoCargaDTO> recibir(MultipartFile file) {
        String contenido;
        try {
            contenido = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ArchivoIlegibleException(file.getOriginalFilename(), ex);
        }
        servicioPlanificacion.recibirArchivo(new ArchivoEntrada(file.getOriginalFilename(), contenido));
        log.info("Archivo ingerido: {}", file.getOriginalFilename());
        return ApiResponseDTO.of(new ResultadoCargaDTO(file.getOriginalFilename()));
    }
}
