package com.paqrap.simulador;

import java.util.Locale;

/** Evento inmutable de log del motor de simulación (movimiento, incidencia, hito de negocio). */
public class EventoSimulacion {

    private final double tiempoHoras;
    private final String reloj;
    private final TipoEvento tipo;
    private final String vehiculoId;
    private final String pedidoId;
    private final int x;
    private final int y;
    private final String descripcion;
    private final String datosAdicionales;

    public EventoSimulacion(double tiempoHoras, double horaBase, TipoEvento tipo, String vehiculoId, String pedidoId,
            int x, int y, String descripcion, String datosAdicionales) {
        this.tiempoHoras = tiempoHoras;
        this.reloj = formatearReloj(tiempoHoras, horaBase);
        this.tipo = tipo;
        this.vehiculoId = vehiculoId;
        this.pedidoId = pedidoId;
        this.x = x;
        this.y = y;
        this.descripcion = descripcion;
        this.datosAdicionales = (datosAdicionales != null) ? datosAdicionales : "";
    }

    public EventoSimulacion(double tiempoHoras, TipoEvento tipo, String vehiculoId, String pedidoId, int x, int y,
            String descripcion, String datosAdicionales) {
        this(tiempoHoras, 7.0, tipo, vehiculoId, pedidoId, x, y, descripcion, datosAdicionales);
    }

    public static String formatearReloj(double horasDesdeInicio, double horaBase) {
        double totalSegundos = (horaBase + horasDesdeInicio) * 3600.0;
        long seg = (long) Math.round(totalSegundos) % (24 * 3600);
        long h = seg / 3600;
        long m = (seg % 3600) / 60;
        long s = seg % 60;
        return String.format("%02d:%02d:%02d", h, m, s);
    }

    public double getTiempoHoras() {
        return tiempoHoras;
    }

    public String getReloj() {
        return reloj;
    }

    public TipoEvento getTipo() {
        return tipo;
    }

    public String getVehiculoId() {
        return vehiculoId;
    }

    public String getPedidoId() {
        return pedidoId;
    }

    public int getX() {
        return x;
    }

    public int getY() {
        return y;
    }

    public String getDescripcion() {
        return descripcion;
    }

    public String getDatosAdicionales() {
        return datosAdicionales;
    }

    public String toLogLine() {
        String veh = (vehiculoId != null) ? "[" + vehiculoId + "] " : "";
        String extra = (!datosAdicionales.isEmpty()) ? " | " + datosAdicionales : "";
        return String.format(Locale.US, "[%s | t=%6.2fh] %-22s %s%s (x=%d, y=%d)%s", reloj, tiempoHoras,
                "[" + tipo + "]", veh, descripcion, x, y, extra);
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"tiempoHoras\":").append(String.format(Locale.US, "%.4f", tiempoHoras)).append(",");
        sb.append("\"reloj\":\"").append(reloj).append("\",");
        sb.append("\"tipo\":\"").append(tipo).append("\",");
        sb.append("\"vehiculoId\":").append(vehiculoId == null ? "null" : "\"" + vehiculoId + "\"").append(",");
        sb.append("\"pedidoId\":").append(pedidoId == null ? "null" : "\"" + pedidoId + "\"").append(",");
        sb.append("\"x\":").append(x).append(",");
        sb.append("\"y\":").append(y).append(",");
        sb.append("\"descripcion\":\"").append(descripcion.replace("\"", "\\\"")).append("\",");
        sb.append("\"datosAdicionales\":\"").append(datosAdicionales.replace("\"", "\\\"")).append("\"");
        sb.append("}");
        return sb.toString();
    }

    @Override
    public String toString() {
        return toLogLine();
    }
}
