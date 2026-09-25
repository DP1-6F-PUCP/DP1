package com.paqrap.simulador;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Simulador de movimientos esquina por esquina: recorre las rutas planificadas emitiendo un
 * evento por cada tramo, llegada, inicio/fin de servicio y pausa de refrigerio, y actualiza el
 * estado real (posición, refrigerio tomado) de cada {@link UnidadTransporte} involucrada.
 *
 * <p>Simplificación de alcance respecto al diseño original: el dominio canónico no fija un
 * almacén base por unidad (cualquier unidad puede recargar en cualquier almacén con stock), así
 * que el "retorno a almacén" al finalizar una ruta se dirige al almacén más cercano a la
 * posición final del vehículo, en vez de a un almacén fijo asignado de antemano.
 */
public class MotorSimulacion {

    private final GestorLogSimulacion gestorLog;
    private final Set<String> pedidosCompletados = new HashSet<>();

    public MotorSimulacion(GestorLogSimulacion gestorLog) {
        this.gestorLog = gestorLog;
    }

    /**
     * Simula la ejecución de las rutas dadas entre {@code tiempoInicioHoras} y
     * {@code tiempoFinMaxHoras}, ambos relativos a {@link ContextoProblema#marcaTiempoActual()}.
     *
     * @return los eventos generados, ya ordenados cronológicamente
     */
    public List<EventoSimulacion> simularRutas(List<Ruta> rutas, List<Pedido> pedidosNoAsignados,
            ContextoProblema contexto, double tiempoInicioHoras, double tiempoFinMaxHoras) {
        List<EventoSimulacion> eventosFase = new ArrayList<>();
        double horaBase = contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0;
        double tiempoServicio = contexto.configuracionOperacion().tiempoServicioClienteHoras();

        int totalPedidos = rutas.stream().mapToInt(r -> r.getSecuenciaParadas().size()).sum();
        double costoTotal = rutas.stream().mapToDouble(Ruta::getCostoEstimado).sum();

        eventosFase.add(new EventoSimulacion(tiempoInicioHoras, horaBase, TipoEvento.PLANIFICACION_RUTAS, null, null,
                -1, -1,
                "Rutas planificadas activadas (" + rutas.size() + " vehículos, " + totalPedidos + " pedidos asignados)",
                String.format(Locale.US, "Costo estimado: S/ %.2f | No asignados: %d", costoTotal,
                        pedidosNoAsignados.size())));

        for (Ruta ruta : rutas) {
            if (ruta.getSecuenciaParadas().isEmpty()) {
                continue;
            }
            simularUnaRuta(ruta, contexto, horaBase, tiempoServicio, tiempoInicioHoras, tiempoFinMaxHoras, eventosFase);
        }

        eventosFase.sort(Comparator.comparingDouble(EventoSimulacion::getTiempoHoras));
        for (EventoSimulacion ev : eventosFase) {
            gestorLog.registrarEvento(ev);
        }
        return eventosFase;
    }

    private void simularUnaRuta(Ruta ruta, ContextoProblema contexto, double horaBase, double tiempoServicio,
            double tiempoInicioHoras, double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase) {
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        TipoVehiculo tipoVehiculo = unidad.getTipoVehiculo();
        double velocidad = tipoVehiculo.getVelocidadKmH();
        double costoKm = tipoVehiculo.getCostoPorKm();

        int cargaActual = ruta.getSecuenciaParadas().stream().mapToInt(ParadaPlanificada::getCantidadAEntregar).sum();

        Nodo nodoActual = unidad.getPosicion();
        double tiempoActual = Math.max(tiempoInicioHoras, horasDesdeAnchor(contexto, ruta.getHoraInicioPlanificada()));
        double distanciaRecorrida = 0.0;

        eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.DESPACHO_VEHICULO, unidad.getIdUnidad(),
                null, nodoActual.x(), nodoActual.y(),
                String.format("Vehículo despachado desde %s con %d pedidos", nodoActual, ruta.getSecuenciaParadas().size()),
                String.format(Locale.US, "Carga: %d/%d paq. | Vel: %.0f km/h", cargaActual, tipoVehiculo.getCapacidad(), velocidad)));

        double duracionRefrigerio = contexto.configuracionOperacion().duracionRefrigerioHoras();
        double tiempoInicioRefrigerio = horasDesdeAnchor(contexto, unidad.getTiempoInicioTurnoActual())
                + contexto.configuracionOperacion().duracionTurnoHoras() / 2.0;
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

        for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
            Pedido pedido = parada.getPedido();
            if (tiempoActual >= tiempoFinMaxHoras) {
                break;
            }
            tiempoActual = Math.max(tiempoActual, horasDesdeAnchor(contexto, pedido.getFechaIngreso()));

            if (!refrigerioTomado && tiempoActual >= tiempoInicioRefrigerio && tiempoActual < tiempoFinMaxHoras) {
                double tInicioRef = tiempoActual;
                double tFinRef = Math.min(tInicioRef + duracionRefrigerio, tiempoFinMaxHoras);
                eventosFase.add(new EventoSimulacion(tInicioRef, horaBase, TipoEvento.INICIO_REFRIGERIO,
                        unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                        String.format(Locale.US, "Conductor de %s inicia pausa obligatoria de refrigerio (%.1fh)",
                                unidad.getIdUnidad(), duracionRefrigerio),
                        String.format("Pausa en %s | Turno: %02d:00", nodoActual, (int) horaBase)));
                tiempoActual = tFinRef;
                if (tInicioRef + duracionRefrigerio <= tiempoFinMaxHoras) {
                    refrigerioTomado = true;
                    eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.FIN_REFRIGERIO,
                            unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                            String.format("Conductor de %s finaliza refrigerio y reanuda operaciones", unidad.getIdUnidad()),
                            String.format(Locale.US, "Tiempo reanudación: t=%.2fh", tiempoActual)));
                }
            }

            if (tiempoActual >= tiempoFinMaxHoras) {
                break;
            }

            Nodo destino = pedido.getDestino();
            LocalDateTime instanteActual = contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0));
            List<Nodo> camino;
            try {
                camino = CalculadorDistancia.caminoMasCorto(contexto.ciudad(), contexto.bloqueos(), instanteActual,
                        nodoActual, destino);
            } catch (IllegalStateException sinCamino) {
                eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.MOVIMIENTO_TRAMO,
                        unidad.getIdUnidad(), pedido.getIdPedido(), nodoActual.x(), nodoActual.y(),
                        "No existe camino disponible hacia " + destino, "Pedido pendiente por bloqueo vial"));
                break;
            }

            ResultadoTramo resultado = recorrerCamino(camino, unidad, pedido.getIdPedido(), contexto, horaBase,
                    velocidad, costoKm, tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, eventosFase,
                    TipoEvento.MOVIMIENTO_TRAMO, destino);
            tiempoActual = resultado.tiempo;
            distanciaRecorrida = resultado.distancia;
            nodoActual = resultado.nodoFinal;

            if (resultado.interrumpido || tiempoActual >= tiempoFinMaxHoras) {
                break;
            }

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.LLEGADA_A_DESTINO,
                    unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                    String.format("Arribo a destino de cliente %s", destino),
                    String.format("Pedido: %s | Demanda: %d", pedido.getIdPedido(), pedido.getCantidadSolicitada())));

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.INICIO_SERVICIO,
                    unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                    String.format("Inicia entrega y descarga de pedido %s", pedido.getIdPedido()),
                    String.format(Locale.US, "Duración de servicio: %.2fh", tiempoServicio)));

            double tiempoFinServicio = tiempoActual + tiempoServicio;
            double tiempoMaximoEntrega = horasDesdeAnchor(contexto, pedido.getFechaLimite());
            boolean aTiempo = tiempoActual <= tiempoMaximoEntrega;
            double holgura = tiempoMaximoEntrega - tiempoActual;

            tiempoActual = Math.min(tiempoFinServicio, tiempoFinMaxHoras);
            cargaActual -= pedido.getCantidadSolicitada();

            if (tiempoFinServicio <= tiempoFinMaxHoras) {
                pedidosCompletados.add(pedido.getIdPedido());
                ruta.marcarParadaCumplida(pedido, parada.getCantidadAEntregar(),
                        contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0)));
            }

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.FIN_SERVICIO_ENTREGA,
                    unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                    String.format(Locale.US, "Finalizó entrega de %s | Estado: %s (Plazo límite: %.1fh, Margen: %+.2fh)",
                            pedido.getIdPedido(), aTiempo ? "A TIEMPO (CUMPLE)" : "TARDÍO (DEMORA)", tiempoMaximoEntrega, holgura),
                    String.format("Carga remanente en vehículo: %d/%d paq.", cargaActual, tipoVehiculo.getCapacidad())));
        }

        if (cargaActual == 0 && tiempoActual < tiempoFinMaxHoras) {
            Almacen destino = almacenMasCercano(contexto.almacenes(), nodoActual);
            if (destino != null && !nodoActual.equals(destino.getPosicion())) {
                tiempoActual = simularRetornoAlmacen(unidad, nodoActual, destino, contexto, horaBase, velocidad,
                        costoKm, tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, refrigerioTomado,
                        tiempoInicioRefrigerio, duracionRefrigerio, eventosFase);
                nodoActual = destino.getPosicion();
            }
        }

        unidad.setPosicion(nodoActual);
        unidad.setRefrigerioTomado(refrigerioTomado);
    }

    private double simularRetornoAlmacen(UnidadTransporte unidad, Nodo nodoActual, Almacen destino,
            ContextoProblema contexto, double horaBase, double velocidad, double costoKm, double tiempoActual,
            double distanciaRecorrida, double tiempoFinMaxHoras, boolean refrigerioTomado,
            double tiempoInicioRefrigerio, double duracionRefrigerio, List<EventoSimulacion> eventosFase) {

        if (!refrigerioTomado && tiempoActual >= tiempoInicioRefrigerio && tiempoActual < tiempoFinMaxHoras) {
            double tInicioRef = tiempoActual;
            double tFinRef = Math.min(tInicioRef + duracionRefrigerio, tiempoFinMaxHoras);
            eventosFase.add(new EventoSimulacion(tInicioRef, horaBase, TipoEvento.INICIO_REFRIGERIO,
                    unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                    String.format(Locale.US, "Conductor de %s inicia pausa obligatoria de refrigerio (%.1fh)",
                            unidad.getIdUnidad(), duracionRefrigerio),
                    String.format("Pausa en %s previa al retorno a almacén", nodoActual)));
            tiempoActual = tFinRef;
        }

        if (tiempoActual >= tiempoFinMaxHoras) {
            return tiempoActual;
        }

        eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.RETORNO_ALMACEN, unidad.getIdUnidad(),
                null, nodoActual.x(), nodoActual.y(),
                String.format("Iniciando retorno hacia almacén %s", destino.getPosicion()),
                String.format(Locale.US, "Distancia previa: %.1f km | Descarga completa", distanciaRecorrida)));

        LocalDateTime instante = contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0));
        List<Nodo> caminoRetorno;
        try {
            caminoRetorno = CalculadorDistancia.caminoMasCorto(contexto.ciudad(), contexto.bloqueos(), instante,
                    nodoActual, destino.getPosicion());
        } catch (IllegalStateException sinCamino) {
            return tiempoActual;
        }

        ResultadoTramo resultado = recorrerCamino(caminoRetorno, unidad, null, contexto, horaBase, velocidad, costoKm,
                tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, eventosFase, TipoEvento.MOVIMIENTO_TRAMO, null);

        if (resultado.tiempo <= tiempoFinMaxHoras && resultado.nodoFinal.equals(destino.getPosicion())) {
            eventosFase.add(new EventoSimulacion(resultado.tiempo, horaBase, TipoEvento.LLEGADA_ALMACEN,
                    unidad.getIdUnidad(), null, destino.getPosicion().x(), destino.getPosicion().y(),
                    String.format("Vehículo %s arribó exitosamente a su almacén de retorno", unidad.getIdUnidad()),
                    String.format(Locale.US, "Jornada completada | Dist total: %.1f km | Costo total: S/ %.2f",
                            resultado.distancia, resultado.distancia * costoKm)));
        }
        return resultado.tiempo;
    }

    private record ResultadoTramo(double tiempo, double distancia, Nodo nodoFinal, boolean interrumpido) {
    }

    private ResultadoTramo recorrerCamino(List<Nodo> camino, UnidadTransporte unidad, String pedidoId,
            ContextoProblema contexto, double horaBase, double velocidad, double costoKm, double tiempoInicial,
            double distanciaInicial, double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase, TipoEvento tipo,
            Nodo destinoFinal) {
        double tiempoActual = tiempoInicial;
        double distanciaRecorrida = distanciaInicial;
        Nodo nodoActual = camino.isEmpty() ? unidad.getPosicion() : camino.get(0);
        double kmPorCuadra = contexto.ciudad().distanciaEntreNodos();

        for (int i = 0; i < camino.size() - 1; i++) {
            Nodo destinoPaso = camino.get(i + 1);
            Nodo origenPaso = nodoActual;
            LocalDateTime instante = contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0));
            boolean bloqueado = contexto.bloqueos().stream()
                    .anyMatch(b -> b.estaVigente(instante) && b.interfiereCon(origenPaso, destinoPaso));
            if (bloqueado) {
                return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, true);
            }

            double tiempoPaso = kmPorCuadra / velocidad;
            tiempoActual += tiempoPaso;
            distanciaRecorrida += kmPorCuadra;
            double costoAcum = distanciaRecorrida * costoKm;

            if (tiempoActual > tiempoFinMaxHoras) {
                return new ResultadoTramo(tiempoFinMaxHoras, distanciaRecorrida, destinoPaso, true);
            }

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, tipo, unidad.getIdUnidad(), pedidoId,
                    destinoPaso.x(), destinoPaso.y(),
                    String.format("Tránsito tramo %s -> %s", nodoActual, destinoPaso),
                    String.format(Locale.US, "Dist: %.1f km | Costo: S/ %.2f", distanciaRecorrida, costoAcum)));
            nodoActual = destinoPaso;
        }

        return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, false);
    }

    private Almacen almacenMasCercano(List<Almacen> almacenes, Nodo desde) {
        return almacenes.stream()
                .min(Comparator.comparingInt(a -> Math.abs(a.getPosicion().x() - desde.x())
                        + Math.abs(a.getPosicion().y() - desde.y())))
                .orElse(null);
    }

    private double horasDesdeAnchor(ContextoProblema contexto, LocalDateTime instante) {
        return java.time.Duration.between(contexto.marcaTiempoActual(), instante).toSeconds() / 3600.0;
    }

    public void registrarBloqueoCalle(double tiempoHoras, ContextoProblema contexto, Bloqueo bloqueo) {
        Nodo primero = bloqueo.getSecuenciaNodos().get(0);
        gestorLog.registrarEvento(new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.INCIDENCIA_BLOQUEO, null, null, primero.x(), primero.y(),
                String.format("ALERTA VIAL: nuevo bloqueo activo sobre %s", bloqueo.getSecuenciaNodos()),
                "Estado: VÍA CLAUSURADA"));
    }

    public void registrarAveriaVehiculo(double tiempoHoras, ContextoProblema contexto, String idUnidad, Nodo posicion,
            String motivo) {
        gestorLog.registrarEvento(new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.INCIDENCIA_AVERIA_VEHICULO, idUnidad, null, posicion.x(), posicion.y(),
                String.format("EMERGENCIA DE FLOTA: Vehículo %s sufrió avería mecánica en %s. Fuera de servicio.",
                        idUnidad, posicion),
                "Motivo: " + motivo + " | Acción: Reasignación forzosa de pedidos"));
    }

    public void registrarNuevoPedido(double tiempoHoras, ContextoProblema contexto, Pedido pedido) {
        gestorLog.registrarEvento(new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.INCIDENCIA_NUEVO_PEDIDO, null, pedido.getIdPedido(), pedido.getDestino().x(),
                pedido.getDestino().y(),
                String.format("NUEVA SOLICITUD: Ingresó pedido exprés %s en destino %s", pedido.getIdPedido(),
                        pedido.getDestino()),
                String.format("Demanda: %d paq. | Plazo: %dh", pedido.getCantidadSolicitada(), pedido.getHorasLimite())));
    }

    public void registrarFinSimulacion(double tiempoHoras, ContextoProblema contexto, String resumenFinal) {
        gestorLog.registrarEvento(new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.FIN_SIMULACION, null, null, -1, -1, "Simulación finalizada exitosamente.", resumenFinal));
        gestorLog.guardarLogs();
    }

    public Set<String> getPedidosCompletados() {
        return pedidosCompletados;
    }
}
