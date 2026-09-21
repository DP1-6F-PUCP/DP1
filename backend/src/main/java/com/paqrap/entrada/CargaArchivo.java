package com.paqrap.entrada;

import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoArchivo;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;

/**
 * Parsea el contenido de un archivo de entrada del curso (pedidos, bloqueos o mantenimientos)
 * en objetos del dominio canónico.
 *
 * <p>Recibe el contenido ya leído como {@code String}; no hace I/O de disco — esa
 * responsabilidad es de {@link CargadorRecursos}, el único punto del sistema con conocimiento de
 * rutas de carpeta.
 *
 * <p>Los errores de línea no detienen el procesamiento completo: se acumulan en
 * {@link #getErrores()} como {@link ErrorImportacion}, permitiendo reportar todos los problemas
 * de un archivo en un solo pase.
 */
public class CargaArchivo {

    private static final DateTimeFormatter HORA_VENTA = DateTimeFormatter.ofPattern("dd'd'HH'h'mm'm'")
            .withResolverStyle(ResolverStyle.STRICT);

    private final String nombreArchivo;
    private final TipoArchivo tipoArchivo;
    private final YearMonth periodo;
    private LocalDateTime fechaProceso;
    private int totalRegistros;

    private final List<Pedido> pedidos = new ArrayList<>();
    private final List<Bloqueo> bloqueos = new ArrayList<>();
    private final List<MantenimientoPendiente> mantenimientosPendientes = new ArrayList<>();
    private final List<ErrorImportacion> errores = new ArrayList<>();

    /**
     * Entrada de mantenimiento aún no resuelta contra la flota real: {@link CargaArchivo} solo
     * conoce el id textual de la unidad (formato {@code TTNN}), no una {@link com.paqrap.dominio.UnidadTransporte}.
     * {@link CargadorRecursos} resuelve cada entrada contra la flota del {@code ContextoProblema}
     * para construir los {@link com.paqrap.dominio.Mantenimiento} canónicos.
     */
    public record MantenimientoPendiente(String idUnidad, LocalDate fecha) {
    }

    /**
     * @param nombreArchivo nombre del archivo procesado, solo con fines de trazabilidad
     * @param tipoArchivo tipo de contenido esperado
     * @param periodo año y mes de referencia para interpretar las fechas relativas del formato
     *         {@code ##d##h##m} (no aplica a mantenimientos, que llevan fecha absoluta)
     */
    public CargaArchivo(String nombreArchivo, TipoArchivo tipoArchivo, YearMonth periodo) {
        this.nombreArchivo = nombreArchivo;
        this.tipoArchivo = tipoArchivo;
        this.periodo = periodo;
    }

    public String getNombreArchivo() {
        return nombreArchivo;
    }

    public TipoArchivo getTipoArchivo() {
        return tipoArchivo;
    }

    public LocalDateTime getFechaProceso() {
        return fechaProceso;
    }

    public int getTotalRegistros() {
        return totalRegistros;
    }

    public List<Pedido> getPedidos() {
        return pedidos;
    }

    public List<Bloqueo> getBloqueos() {
        return bloqueos;
    }

    public List<MantenimientoPendiente> getMantenimientosPendientes() {
        return mantenimientosPendientes;
    }

    public List<ErrorImportacion> getErrores() {
        return errores;
    }

    /**
     * Procesa el contenido del archivo línea por línea, según {@code tipoArchivo}.
     *
     * @param contenido contenido completo del archivo, ya leído
     */
    public void procesarArchivo(String contenido) {
        fechaProceso = LocalDateTime.now();
        String[] lineas = contenido.split("\\R");
        int numeroLinea = 0;
        for (String lineaCruda : lineas) {
            numeroLinea++;
            String linea = lineaCruda.trim();
            if (linea.isEmpty() || linea.startsWith("#")) {
                continue;
            }
            try {
                procesarLinea(linea, numeroLinea);
            } catch (IllegalArgumentException ex) {
                errores.add(new ErrorImportacion(linea, ex.getMessage(), LocalDateTime.now()));
            }
        }
        totalRegistros = pedidos.size() + bloqueos.size() + mantenimientosPendientes.size();
    }

    private void procesarLinea(String linea, int numeroLinea) {
        switch (tipoArchivo) {
            case PEDIDOS -> procesarLineaPedido(linea, numeroLinea);
            case BLOQUEOS -> procesarLineaBloqueo(linea, numeroLinea);
            case MANTENIMIENTO -> procesarLineaMantenimiento(linea, numeroLinea);
            case AVERIAS -> throw new IllegalArgumentException(
                    "Las averías se registran en caliente por interfaz, no por archivo");
        }
    }

    private void procesarLineaPedido(String linea, int numeroLinea) {
        String[] partes = separar(linea, ":", 2, numeroLinea);
        LocalDateTime fecha = parsearFechaVenta(partes[0], numeroLinea);
        String[] datos = separar(partes[1], ",", 5, numeroLinea);
        int posX = parsearEntero(datos[0], numeroLinea, "posX");
        int posY = parsearEntero(datos[1], numeroLinea, "posY");
        String idCliente = datos[2];
        int cantidad = parsearEntero(datos[3], numeroLinea, "cantidad");
        int horasLimite = parsearEntero(datos[4], numeroLinea, "horas límite");
        if (idCliente.isEmpty()) {
            throw error(numeroLinea, "el identificador del cliente está vacío");
        }
        String idPedido = String.format("PED-%s-%04d", periodo, pedidos.size() + 1);
        pedidos.add(new Pedido(idPedido, idCliente, new Nodo(posX, posY), cantidad, horasLimite, fecha));
    }

    private void procesarLineaBloqueo(String linea, int numeroLinea) {
        String[] partes = separar(linea, ":", 2, numeroLinea);
        String[] intervalo = separar(partes[0], "-", 2, numeroLinea);
        LocalDateTime inicio = parsearFechaBloqueo(intervalo[0], numeroLinea);
        LocalDateTime fin = parsearFechaBloqueo(intervalo[1], numeroLinea);
        if (fin.isBefore(inicio)) {
            fin = fin.plusMonths(1);
        }
        String[] coordenadas = partes[1].split(",");
        if (coordenadas.length < 4 || coordenadas.length % 2 != 0) {
            throw error(numeroLinea, "la poligonal debe tener pares x,y");
        }
        List<Nodo> nodos = new ArrayList<>();
        for (int i = 0; i < coordenadas.length; i += 2) {
            nodos.add(new Nodo(parsearEntero(coordenadas[i], numeroLinea, "posX"),
                    parsearEntero(coordenadas[i + 1], numeroLinea, "posY")));
        }
        bloqueos.add(new Bloqueo(nodos, inicio, fin));
    }

    private void procesarLineaMantenimiento(String linea, int numeroLinea) {
        String[] partes = separar(linea, ":", 2, numeroLinea);
        if (!partes[0].matches("\\d{8}") || !partes[1].matches("[A-Za-z]{2}\\d{2}")) {
            throw error(numeroLinea, "formato esperado aaaammdd:TTNN");
        }
        LocalDate fecha;
        try {
            fecha = LocalDate.parse(partes[0], DateTimeFormatter.BASIC_ISO_DATE.withResolverStyle(ResolverStyle.STRICT));
        } catch (DateTimeParseException ex) {
            throw error(numeroLinea, "fecha inválida");
        }
        mantenimientosPendientes.add(new MantenimientoPendiente(partes[1].toUpperCase(), fecha));
    }

    private LocalDateTime parsearFechaVenta(String valor, int numeroLinea) {
        try {
            return LocalDateTime.of(periodo.atDay(1), LocalTime.MIDNIGHT)
                    .withDayOfMonth(Integer.parseInt(valor.substring(0, 2)))
                    .with(LocalTime.from(HORA_VENTA.parse(valor)));
        } catch (RuntimeException ex) {
            throw error(numeroLinea, "hora de venta inválida");
        }
    }

    private LocalDateTime parsearFechaBloqueo(String valor, int numeroLinea) {
        try {
            int dia = Integer.parseInt(valor.substring(0, 2));
            int hora = Integer.parseInt(valor.substring(3, 5));
            int minuto = Integer.parseInt(valor.substring(6, 8));
            return LocalDateTime.of(periodo.atDay(dia), LocalTime.of(hora, minuto));
        } catch (RuntimeException ex) {
            throw error(numeroLinea, "fecha de bloqueo inválida");
        }
    }

    private String[] separar(String valor, String separador, int cantidad, int numeroLinea) {
        String[] partes = valor.split(separador, -1);
        if (partes.length != cantidad) {
            throw error(numeroLinea, "cantidad de campos inválida");
        }
        for (int i = 0; i < partes.length; i++) {
            partes[i] = partes[i].trim();
        }
        return partes;
    }

    private int parsearEntero(String valor, int numeroLinea, String campo) {
        try {
            return Integer.parseInt(valor.trim());
        } catch (NumberFormatException ex) {
            throw error(numeroLinea, campo + " inválido");
        }
    }

    private IllegalArgumentException error(int numeroLinea, String mensaje) {
        return new IllegalArgumentException(nombreArchivo + ":" + numeroLinea + ": " + mensaje);
    }
}
