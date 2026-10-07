package com.paqrap.simulador;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Acumula {@link EventoSimulacion} y los persiste en texto plano y JSON para el visualizador. */
public class GestorLogSimulacion {

    private static final Logger log = LoggerFactory.getLogger(GestorLogSimulacion.class);

    // Tope del buffer en memoria -- antes esta lista crecia sin limite durante toda la vida del
    // escenario (confirmado: registrarFinSimulacion/guardarLogs, el unico punto que la vacia hacia
    // disco, es codigo muerto, nunca invocado desde OrquestadorOperacion). El frontend recibe sus
    // eventos por un camino totalmente distinto (OrquestadorOperacion.ultimosEventos, que se
    // reemplaza cada lote, no se acumula), asi que esta lista no cumplia ningun proposito activo
    // en produccion mas alla de consumir memoria indefinidamente en una corrida larga. Se acota a
    // los ultimos N eventos para que, si guardarLogs() se conecta en el futuro, siga produciendo
    // un historial reciente util sin volver a crecer sin limite.
    private static final int MAX_EVENTOS_EN_MEMORIA = 5000;

    private final List<EventoSimulacion> eventos;
    private final File archivoLogTexto;
    private final File archivoLogJson;
    private boolean imprimirEnConsola;

    public GestorLogSimulacion(String rutaDirectorioLogs, boolean imprimirEnConsola) {
        this.eventos = new ArrayList<>();
        this.imprimirEnConsola = imprimirEnConsola;

        File dir = new File(rutaDirectorioLogs);
        if (!dir.exists()) {
            dir.mkdirs();
        }

        this.archivoLogTexto = new File(dir, "simulacion_movimientos.log");
        this.archivoLogJson = new File(dir, "simulacion_movimientos.json");
    }

    public GestorLogSimulacion() {
        this("logs", true);
    }

    public synchronized void registrarEvento(EventoSimulacion evento) {
        eventos.add(evento);
        if (eventos.size() > MAX_EVENTOS_EN_MEMORIA) {
            eventos.subList(0, eventos.size() - MAX_EVENTOS_EN_MEMORIA).clear();
        }
        if (imprimirEnConsola) {
            log.info(evento.toLogLine());
        }
    }

    public synchronized void registrarEstado(double tiempo, String descripcion, String resumenMetricas) {
        registrarEvento(new EventoSimulacion(tiempo, TipoEvento.SNAPSHOT_ESTADO, null, null, -1, -1, descripcion,
                resumenMetricas));
    }

    public synchronized void guardarLogs() {
        try (PrintWriter pw = new PrintWriter(
                new OutputStreamWriter(new FileOutputStream(archivoLogTexto), StandardCharsets.UTF_8))) {
            pw.println("=========================================================================================================");
            pw.println("                     PAQRAP - REGISTRO DE MOVIMIENTOS Y ESTADO DE LA SIMULACIÓN                         ");
            pw.println("=========================================================================================================");
            pw.println("Fecha de Generación: " + new Date());
            pw.println("Total de Eventos Registrados: " + eventos.size());
            pw.println("---------------------------------------------------------------------------------------------------------\n");

            for (EventoSimulacion ev : eventos) {
                pw.println(ev.toLogLine());
            }

            pw.println("\n---------------------------------------------------------------------------------------------------------");
            pw.println("                                         FIN DEL REGISTRO DE LOG                                         ");
            pw.println("=========================================================================================================");
        } catch (IOException e) {
            log.error("Error al escribir el archivo de log en texto: {}", e.getMessage(), e);
        }

        try (PrintWriter pw = new PrintWriter(
                new OutputStreamWriter(new FileOutputStream(archivoLogJson), StandardCharsets.UTF_8))) {
            pw.println("{");
            pw.println("  \"sistema\": \"PaqRap Logística\",");
            pw.println("  \"fechaGeneracion\": \"" + new Date() + "\",");
            pw.println("  \"totalEventos\": " + eventos.size() + ",");
            pw.println("  \"eventos\": [");
            for (int i = 0; i < eventos.size(); i++) {
                pw.print("    " + eventos.get(i).toJson());
                pw.println(i < eventos.size() - 1 ? "," : "");
            }
            pw.println("  ]");
            pw.println("}");
        } catch (IOException e) {
            log.error("Error al escribir el archivo de log en JSON: {}", e.getMessage(), e);
        }
    }

    public List<EventoSimulacion> getEventos() {
        return Collections.unmodifiableList(eventos);
    }

    public File getArchivoLogTexto() {
        return archivoLogTexto;
    }

    public File getArchivoLogJson() {
        return archivoLogJson;
    }

    public void setImprimirEnConsola(boolean imprimirEnConsola) {
        this.imprimirEnConsola = imprimirEnConsola;
    }
}
