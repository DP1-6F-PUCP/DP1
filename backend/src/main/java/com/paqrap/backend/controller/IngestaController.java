package com.paqrap.backend.controller;

import com.paqrap.backend.dto.ApiResponseDTO;
import com.paqrap.backend.dto.ResultadoCargaDTO;
import com.paqrap.backend.exception.ArchivoIlegibleException;
import com.paqrap.backend.persistence.DatabaseSeederRunner;
import org.springframework.beans.factory.ObjectProvider;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.exposicion.ArchivoEntrada;
import com.paqrap.exposicion.ServicioPlanificacion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.paqrap.exposicion.RepositorioOperacion;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import java.util.List;
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
 *
 * <p><b>Ya no es necesaria en operación normal:</b> {@code ServicioPlanificacionImpl} carga por sí
 * solo, bajo demanda, los archivos oficiales del curso empaquetados en la imagen (ver
 * {@code PaqRapConfig#cargadorRecursos} y {@code OrquestadorOperacion#asegurarDatosOficialesCargados}).
 * Estos endpoints quedan como override manual para casos ad-hoc (p. ej. datos de prueba distintos a
 * los oficiales), no como el flujo principal de ingesta.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class IngestaController {

    private final ServicioPlanificacion servicioPlanificacion;
    private final ObjectProvider<DatabaseSeederRunner> seederProvider;

    @PostMapping("/api/files/orders")
    public ApiResponseDTO<ResultadoCargaDTO> cargarPedidos(@RequestParam("file") MultipartFile file) {
        return recibir(file, TipoArchivo.PEDIDOS);
    }

    @PostMapping("/api/files/blocked-streets")
    public ApiResponseDTO<ResultadoCargaDTO> cargarBloqueos(@RequestParam("file") MultipartFile file) {
        return recibir(file, TipoArchivo.BLOQUEOS);
    }

    @PostMapping("/api/files/maintenance")
    public ApiResponseDTO<ResultadoCargaDTO> cargarMantenimiento(@RequestParam("file") MultipartFile file) {
        return recibir(file, TipoArchivo.MANTENIMIENTO);
    }

    /**
     * Sin parámetro: borra solo lo cargado a mano. {@code ?alcance=todo}: borra también los datos
     * estándar precargados (prueba de "sistema sin datos"; se recuperan con POST /api/files/estandar).
     */
    @DeleteMapping("/api/files")
    public ApiResponseDTO<Void> limpiarArchivos(@RequestParam(required = false) String alcance) {
        if ("todo".equalsIgnoreCase(alcance)) {
            servicioPlanificacion.limpiarTodosLosDatos();
            log.warn("Todos los datos (también los estándar) borrados mediante API");
        } else {
            servicioPlanificacion.limpiarArchivosCargados();
            log.info("Archivos cargados limpiados mediante API");
        }
        return ApiResponseDTO.of(null);
    }

    /** Archivos cargados vigentes: estándar (OFFICIAL) y subidos a mano (MANUAL). */
    @GetMapping("/api/files")
    public ApiResponseDTO<List<RepositorioOperacion.ImportacionVigente>> listarArchivos() {
        return ApiResponseDTO.of(servicioPlanificacion.listarArchivosCargados());
    }

    /** Borra un archivo cargado (estándar o manual) y sus datos. */
    @DeleteMapping("/api/files/{id}")
    public ApiResponseDTO<Void> borrarArchivo(@PathVariable String id) {
        servicioPlanificacion.borrarArchivoCargado(id);
        return ApiResponseDTO.of(null);
    }

    /** Vuelve a cargar los datos estándar empaquetados (después de borrarlos con alcance=todo). */
    @PostMapping("/api/files/estandar")
    public ApiResponseDTO<Void> restaurarEstandar() {
        DatabaseSeederRunner seeder = seederProvider.getIfAvailable();
        if (seeder == null) {
            throw new IllegalStateException("No hay base de datos configurada para restaurar los datos estándar.");
        }
        seeder.restaurarEstandar();
        log.info("Datos estándar restaurados mediante API");
        return ApiResponseDTO.of(null);
    }

    private ApiResponseDTO<ResultadoCargaDTO> recibir(MultipartFile file, TipoArchivo tipo) {
        String contenido;
        try {
            contenido = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ArchivoIlegibleException(file.getOriginalFilename(), ex);
        }
        var resumen = servicioPlanificacion.recibirArchivoConResumen(
                new ArchivoEntrada(file.getOriginalFilename(), contenido), tipo);
        log.info("Archivo ingerido ({}): {}", tipo, file.getOriginalFilename());
        return ApiResponseDTO.of(resumen == null
                ? new ResultadoCargaDTO(file.getOriginalFilename())
                : new ResultadoCargaDTO(file.getOriginalFilename(), true, resumen.incorporados(), resumen.programados(),
                        resumen.anterioresAlInicio(), resumen.vencidos()));
    }
}
