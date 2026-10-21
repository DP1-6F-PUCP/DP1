package com.paqrap.simulador;

import com.paqrap.dominio.ActividadVehiculo;
import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoParada;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.EstadoUnidad;
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
        // Se limpia al inicio de cada lote: OrquestadorOperacion usa getPedidosCompletados().size()
        // para incrementar el reporte SOLO con lo entregado en ESTE lote -- si se dejara acumular
        // para siempre (como estaba antes), cada lote sumaría también lo ya contado en lotes
        // previos, sobre-contando las entregas totales.
        pedidosCompletados.clear();
        // Trayectoria real del lote (ver UnidadTransporte.trayectoriaLote): punto de partida de
        // TODAS las unidades -- incluidas las que no reciben ruta (averiadas, en mantenimiento),
        // para que el visualizador sepa que se quedaron quietas o que fueron trasladadas.
        for (UnidadTransporte unidad : contexto.vehiculos()) {
            unidad.iniciarTrayectoria(contexto.marcaTiempoActual());
        }
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
                // Bug real reportado (confirmado en vivo: vehiculos "Entregando" quietos a mitad
                // de mapa, nunca regresan al almacen): ALNS crea una ruta VACIA placeholder cada
                // lote para todo vehiculo disponible sin pedidos que asignarle. Antes esto se
                // saltaba sin mas -- pero TODA la logica que resetea actividadActual a INACTIVO y
                // dispara el regreso al almacen vive dentro de simularUnaRuta, que nunca corria
                // para estas rutas. Un vehiculo que terminaba de entregar justo al final del
                // presupuesto de un lote (sin tiempo sobrante para regresar ESE lote) quedaba
                // parado para siempre en el punto de su ultima entrega, con la etiqueta vieja.
                manejarVehiculoSinParadas(ruta.getUnidadTransporte(), contexto, horaBase, tiempoFinMaxHoras,
                        eventosFase);
                continue;
            }
            simularUnaRuta(ruta, contexto, horaBase, tiempoServicio, tiempoInicioHoras, tiempoFinMaxHoras, eventosFase);
        }

        // Punto de cierre: donde quedó cada unidad al final del lote y qué está haciendo.
        LocalDateTime finLote = instanteDe(contexto, tiempoFinMaxHoras);
        for (UnidadTransporte unidad : contexto.vehiculos()) {
            unidad.registrarPuntoTrayectoria(unidad.getPosicion(), finLote, unidad.getActividadActual());
        }

        eventosFase.sort(Comparator.comparingDouble(EventoSimulacion::getTiempoHoras));
        for (EventoSimulacion ev : eventosFase) {
            gestorLog.registrarEvento(ev);
        }
        return eventosFase;
    }

    private LocalDateTime instanteDe(ContextoProblema contexto, double horas) {
        return contexto.marcaTiempoActual().plusSeconds(Math.round(horas * 3600.0));
    }

    /**
     * Cierra el ciclo de un vehiculo disponible que este lote no recibio ningun pedido nuevo
     * (ruta placeholder vacia) -- lo devuelve al almacen mas cercano si no esta ya ahi, y resetea
     * su actividad a INACTIVO. Mismo patron que el cierre de {@link #simularUnaRuta} (que SI corre
     * para rutas con paradas), extraido aqui porque ese metodo nunca se invoca cuando no hay
     * paradas que recorrer.
     */
    private void manejarVehiculoSinParadas(UnidadTransporte unidad, ContextoProblema contexto, double horaBase,
            double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase) {
        var operacion = contexto.configuracionOperacion();
        LocalDateTime turnoActual = operacion.inicioTurnoQueContiene(contexto.marcaTiempoActual());
        if (!turnoActual.equals(unidad.getTiempoInicioTurnoActual())) {
            unidad.setTiempoInicioTurnoActual(turnoActual);
            unidad.setRefrigerioTomado(false);
            unidad.setHoraRefrigerioProgramada(null);
        }
        double duracionRefrigerio = operacion.duracionRefrigerioHoras();
        double tiempoInicioRefrigerio = horasDesdeAnchor(contexto, operacion.inicioRefrigerioMasTardio(turnoActual));
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

        boolean ocioso = unidad.getActividadActual() == ActividadVehiculo.INACTIVO
                || (unidad.getActividadActual() == ActividadVehiculo.EN_REFRIGERIO
                        && Almacen.masCercano(contexto.almacenes(), unidad.getPosicion()) != null
                        && Almacen.masCercano(contexto.almacenes(), unidad.getPosicion()).getPosicion().equals(unidad.getPosicion()));
        if (ocioso) {
            tomarRefrigerioOcioso(unidad, contexto, horaBase, tiempoFinMaxHoras, refrigerioTomado, duracionRefrigerio,
                    horasDesdeAnchor(contexto, operacion.inicioVentanaRefrigerio(turnoActual)), eventosFase);
            return;
        }

        Nodo nodoActual = unidad.getPosicion();
        boolean retornoPendiente = false;
        Almacen destino = Almacen.masCercanoConStock(contexto.almacenes(), nodoActual);
        if (destino != null && !nodoActual.equals(destino.getPosicion())) {
            unidad.setActividadActual(ActividadVehiculo.VIAJANDO);
            ResultadoTramo retorno = simularRetornoAlmacen(unidad, nodoActual, destino, contexto, horaBase,
                    unidad.getTipoVehiculo().getVelocidadKmH(), unidad.getTipoVehiculo().getCostoPorKm(), 0.0, 0.0,
                    tiempoFinMaxHoras, refrigerioTomado, tiempoInicioRefrigerio, duracionRefrigerio, eventosFase);
            nodoActual = retorno.nodoFinal();
            retornoPendiente = retorno.interrumpido();
        }

        unidad.setPosicion(nodoActual);
        unidad.setRefrigerioTomado(refrigerioTomado);
        unidad.setActividadActual(actividadTrasRetorno(unidad, retornoPendiente));
    }

    /**
     * Refrigerio "en tiempo muerto": un vehículo ocioso en el almacén toma su refrigerio en cuanto
     * se abre la ventana permitida del turno, en vez de esperar al último momento -- así queda
     * disponible cuando más se lo necesita. Antes toda la flota paraba a la vez en el punto medio
     * del turno (ver ConfiguracionOperacion.inicioRefrigerioMasTardio).
     */
    private void tomarRefrigerioOcioso(UnidadTransporte unidad, ContextoProblema contexto, double horaBase,
            double tiempoFinMaxHoras, boolean refrigerioTomado, double duracionRefrigerio, double inicioVentana,
            List<EventoSimulacion> eventosFase) {
        if (refrigerioTomado || inicioVentana >= tiempoFinMaxHoras) {
            return;
        }
        double desde = Math.max(0.0, inicioVentana);
        ResultadoRefrigerio res = manejarRefrigerio(unidad, desde, false, inicioVentana, duracionRefrigerio,
                tiempoFinMaxHoras, contexto, horaBase, unidad.getPosicion(), eventosFase);
        if (res.refrigerioTomado()) {
            unidad.setRefrigerioTomado(true);
            unidad.setActividadActual(ActividadVehiculo.INACTIVO);
            unidad.registrarPuntoTrayectoria(unidad.getPosicion(), instanteDe(contexto, res.tiempoActual()),
                    ActividadVehiculo.INACTIVO);
        }
    }

    /** Actividad con la que queda una unidad tras intentar volver al almacén: INACTIVO si llegó;
     * si no, sigue en refrigerio (si el lote terminó durante la pausa) o VIAJANDO. */
    private ActividadVehiculo actividadTrasRetorno(UnidadTransporte unidad, boolean retornoPendiente) {
        if (!retornoPendiente) {
            return ActividadVehiculo.INACTIVO;
        }
        return unidad.getActividadActual() == ActividadVehiculo.EN_REFRIGERIO
                ? ActividadVehiculo.EN_REFRIGERIO
                : ActividadVehiculo.VIAJANDO;
    }

    private void simularUnaRuta(Ruta ruta, ContextoProblema contexto, double horaBase, double tiempoServicio,
            double tiempoInicioHoras, double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase) {
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        TipoVehiculo tipoVehiculo = unidad.getTipoVehiculo();
        double velocidad = tipoVehiculo.getVelocidadKmH();
        double costoKm = tipoVehiculo.getCostoPorKm();

        // Si la ruta ya venia EN_EJECUCION de un lote anterior, esto es una continuacion, no un
        // despacho nuevo: no se reemite DESPACHO_VEHICULO ni se recorren de nuevo las paradas ya
        // CUMPLIDA (evita re-entregar/duplicar eventos). Ver UnidadTransporte.estaDisponibleParaRuta
        // -- mientras la ruta no termine, el vehiculo no vuelve a ser candidato para una ruta nueva.
        boolean esDespachoNuevo = ruta.getEstado() != EstadoRuta.EN_EJECUCION;
        List<ParadaPlanificada> paradasPendientes = ruta.getSecuenciaParadas().stream()
                .filter(p -> p.getEstado() != EstadoParada.CUMPLIDA)
                .toList();
        int cargaActual = paradasPendientes.stream().mapToInt(ParadaPlanificada::getCantidadAEntregar).sum();

        Nodo nodoActual = unidad.getPosicion();
        double tiempoActual = Math.max(tiempoInicioHoras, horasDesdeAnchor(contexto, ruta.getHoraInicioPlanificada()));
        double distanciaRecorrida = 0.0;

        if (esDespachoNuevo) {
            unidad.setEstado(EstadoUnidad.EN_RUTA);
            ruta.setEstado(EstadoRuta.EN_EJECUCION);
            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.DESPACHO_VEHICULO,
                    unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                    String.format("Vehículo despachado desde %s con %d pedidos", nodoActual, paradasPendientes.size()),
                    String.format(Locale.US, "Carga: %d/%d paq. | Vel: %.0f km/h", cargaActual,
                            tipoVehiculo.getCapacidad(), velocidad)));
        }

        // El turno de la unidad se recalcula cada lote contra el turno REAL que contiene el
        // instante actual (07:00/15:00/23:00) -- antes, unidad.getTiempoInicioTurnoActual() nunca
        // se actualizaba desde la construcción del vehículo, así que el refrigerio solo se
        // calculaba (y se tomaba) una vez en toda la vida del vehículo, nunca en turnos
        // posteriores. El cambio de turno es un handoff instantáneo de conductor (regla de
        // negocio confirmada: "el conductor alcanza al vehículo donde esté"), así que un turno
        // nuevo simplemente resetea el refrigerio disponible, sin mover el vehículo.
        LocalDateTime turnoActual = contexto.configuracionOperacion().inicioTurnoQueContiene(contexto.marcaTiempoActual());
        if (!turnoActual.equals(unidad.getTiempoInicioTurnoActual())) {
            unidad.setTiempoInicioTurnoActual(turnoActual);
            unidad.setRefrigerioTomado(false);
            unidad.setHoraRefrigerioProgramada(null);
        }

        double duracionRefrigerio = contexto.configuracionOperacion().duracionRefrigerioHoras();
        // Un vehículo ocupado toma el refrigerio a más tardar en el último inicio permitido.
        double tiempoInicioRefrigerio = horasDesdeAnchor(contexto,
                contexto.configuracionOperacion().inicioRefrigerioMasTardio(turnoActual));
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

        for (ParadaPlanificada parada : paradasPendientes) {
            Pedido pedido = parada.getPedido();
            if (tiempoActual >= tiempoFinMaxHoras) {
                break;
            }
            tiempoActual = Math.max(tiempoActual, horasDesdeAnchor(contexto, pedido.getFechaIngreso()));

            ResultadoRefrigerio resRefrigerio = manejarRefrigerio(unidad, tiempoActual, refrigerioTomado,
                    tiempoInicioRefrigerio, duracionRefrigerio, tiempoFinMaxHoras, contexto, horaBase, nodoActual,
                    eventosFase);
            tiempoActual = resRefrigerio.tiempoActual();
            refrigerioTomado = resRefrigerio.refrigerioTomado();

            if (tiempoActual >= tiempoFinMaxHoras) {
                break;
            }

            Nodo destino = pedido.getDestino();

            if (parada.getHoraInicioServicio() == null) {
                // Aún no llegó a este destino -- viajar. Si el servicio (1h) no cupo en un solo
                // lote, esta rama NO se repite en lotes siguientes (ver la rama "else"): ya viajó
                // y llegó, solo falta que se cumpla el tiempo de servicio restante.
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

                unidad.setActividadActual(ActividadVehiculo.VIAJANDO);
                ResultadoTramo resultado = recorrerCamino(camino, unidad, pedido.getIdPedido(), contexto, horaBase,
                        velocidad, costoKm, tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, eventosFase,
                        TipoEvento.MOVIMIENTO_TRAMO, destino, refrigerioTomado ? Double.MAX_VALUE : tiempoInicioRefrigerio);
                tiempoActual = resultado.tiempo;
                distanciaRecorrida = resultado.distancia;
                nodoActual = resultado.nodoFinal;

                if (resultado.interrumpido || tiempoActual >= tiempoFinMaxHoras) {
                    break;
                }
                if (resultado.pausaRefrigerio) {
                    // Llegó la hora límite del refrigerio en pleno viaje (o al llegar, antes de
                    // servir): lo toma aquí y luego sigue. Si no termina en este lote, el próximo
                    // lote lo retoma (manejarRefrigerio al inicio del bucle) y reanuda el viaje.
                    ResultadoRefrigerio pausa = manejarRefrigerio(unidad, tiempoActual, false, tiempoActual,
                            duracionRefrigerio, tiempoFinMaxHoras, contexto, horaBase, nodoActual, eventosFase);
                    tiempoActual = pausa.tiempoActual();
                    refrigerioTomado = pausa.refrigerioTomado();
                    if (tiempoActual >= tiempoFinMaxHoras) {
                        break;
                    }
                    if (!nodoActual.equals(destino)) {
                        LocalDateTime reanudacion = contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0));
                        try {
                            camino = CalculadorDistancia.caminoMasCorto(contexto.ciudad(), contexto.bloqueos(), reanudacion,
                                    nodoActual, destino);
                        } catch (IllegalStateException sinCamino) {
                            break;
                        }
                        unidad.setActividadActual(ActividadVehiculo.VIAJANDO);
                        resultado = recorrerCamino(camino, unidad, pedido.getIdPedido(), contexto, horaBase, velocidad,
                                costoKm, tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, eventosFase,
                                TipoEvento.MOVIMIENTO_TRAMO, destino);
                        tiempoActual = resultado.tiempo;
                        distanciaRecorrida = resultado.distancia;
                        nodoActual = resultado.nodoFinal;
                        if (resultado.interrumpido || tiempoActual >= tiempoFinMaxHoras) {
                            break;
                        }
                    }
                }

                eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.LLEGADA_A_DESTINO,
                        unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                        String.format("Arribo a destino de cliente %s", destino),
                        String.format("Pedido: %s | Demanda: %d", pedido.getIdPedido(), pedido.getCantidadSolicitada())));

                parada.setHoraInicioServicio(contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0)));
                unidad.registrarPuntoTrayectoria(destino, instanteDe(contexto, tiempoActual), ActividadVehiculo.ENTREGANDO);
                eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.INICIO_SERVICIO,
                        unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                        String.format("Inicia entrega y descarga de pedido %s", pedido.getIdPedido()),
                        String.format(Locale.US, "Duración de servicio: %.2fh", tiempoServicio)));
                unidad.setActividadActual(ActividadVehiculo.ENTREGANDO);
            } else {
                // Ya había llegado y arrancado el servicio en un lote anterior; venía esperando a
                // que se cumplan las horas de servicio restantes (nodoActual ya es el destino).
                nodoActual = destino;
                unidad.setActividadActual(ActividadVehiculo.ENTREGANDO);
            }

            // El fin del servicio se ancla a horaInicioServicio (fijo, absoluto) + duración total
            // -- nunca se reinicia entre lotes, así que un servicio de 1h que no cabe en la
            // ventana de un lote avanza lote a lote hasta completarse, en vez de reiniciar por
            // siempre (bug real corregido: antes, cada lote recalculaba tiempoFinServicio desde el
            // instante actual, así que un servicio más largo que una ventana nunca terminaba).
            LocalDateTime horaFinServicioAbs = parada.getHoraInicioServicio()
                    .plusSeconds(Math.round(tiempoServicio * 3600.0));
            double tiempoFinServicio = horasDesdeAnchor(contexto, horaFinServicioAbs);
            double tiempoMaximoEntrega = horasDesdeAnchor(contexto, pedido.getFechaLimite());
            // "A tiempo" se evalúa contra la LLEGADA (horaInicioServicio), no contra el fin del
            // servicio -- el plazo del cliente excluye la hora de acondicionamiento/entrega.
            boolean aTiempo = !parada.getHoraInicioServicio().isAfter(pedido.getFechaLimite());
            double holgura = java.time.Duration.between(parada.getHoraInicioServicio(), pedido.getFechaLimite())
                    .toSeconds() / 3600.0;

            tiempoActual = Math.min(tiempoFinServicio, tiempoFinMaxHoras);

            if (tiempoFinServicio > tiempoFinMaxHoras) {
                break; // el servicio no termina en este lote -- se retoma el siguiente
            }

            cargaActual -= pedido.getCantidadSolicitada();
            pedidosCompletados.add(pedido.getIdPedido());
            ruta.marcarParadaCumplida(pedido, parada.getCantidadAEntregar(), horaFinServicioAbs);

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.FIN_SERVICIO_ENTREGA,
                    unidad.getIdUnidad(), pedido.getIdPedido(), destino.x(), destino.y(),
                    String.format(Locale.US, "Finalizó entrega de %s | Estado: %s (Plazo límite: %.1fh, Margen: %+.2fh)",
                            pedido.getIdPedido(), aTiempo ? "A TIEMPO (CUMPLE)" : "TARDÍO (DEMORA)", tiempoMaximoEntrega, holgura),
                    String.format("Carga remanente en vehículo: %d/%d paq.", cargaActual, tipoVehiculo.getCapacidad())));
        }

        boolean retornoPendiente = false;
        if (cargaActual == 0 && tiempoActual < tiempoFinMaxHoras) {
            Almacen destino = Almacen.masCercanoConStock(contexto.almacenes(), nodoActual);
            if (destino != null && !nodoActual.equals(destino.getPosicion())) {
                unidad.setActividadActual(ActividadVehiculo.VIAJANDO);
                ResultadoTramo retorno = simularRetornoAlmacen(unidad, nodoActual, destino, contexto, horaBase,
                        velocidad, costoKm, tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, refrigerioTomado,
                        tiempoInicioRefrigerio, duracionRefrigerio, eventosFase);
                tiempoActual = retorno.tiempo();
                nodoActual = retorno.nodoFinal();
                retornoPendiente = retorno.interrumpido();
            }
        }

        unidad.setPosicion(nodoActual);
        unidad.setRefrigerioTomado(refrigerioTomado);

        // Si ya no queda ninguna parada pendiente, la ruta terminó de verdad (no solo se acabó el
        // tiempo de este lote) -- libera al vehículo para que el próximo lote pueda asignarle una
        // ruta nueva. Si quedan paradas pendientes, se deja EN_RUTA/EN_EJECUCION tal cual: el
        // próximo lote la retoma donde quedó (ver el chequeo de esDespachoNuevo al inicio).
        boolean quedanParadasPendientes = ruta.getSecuenciaParadas().stream()
                .anyMatch(p -> p.getEstado() != EstadoParada.CUMPLIDA);
        if (!quedanParadasPendientes) {
            ruta.setEstado(EstadoRuta.FINALIZADA);
            unidad.setEstado(EstadoUnidad.DISPONIBLE);
            // Si el regreso al almacén quedó a medias, sigue VIAJANDO: el próximo lote lo continúa
            // (manejarVehiculoSinParadas) en vez de dejarlo varado a mitad de camino como INACTIVO.
            unidad.setActividadActual(actividadTrasRetorno(unidad, retornoPendiente));
        }
    }

    /**
     * Bug real corregido: antes devolvía solo el tiempo y los llamadores fijaban la posición en el
     * almacén SIEMPRE, aunque el lote terminara a mitad del regreso -- la unidad se teletransportaba
     * al almacén al cierre del lote (y el visualizador lo animaba como un viaje imposible). Ahora
     * devuelve dónde quedó realmente; {@code interrumpido} indica que todavía no llegó.
     */
    private ResultadoTramo simularRetornoAlmacen(UnidadTransporte unidad, Nodo nodoActual, Almacen destino,
            ContextoProblema contexto, double horaBase, double velocidad, double costoKm, double tiempoActual,
            double distanciaRecorrida, double tiempoFinMaxHoras, boolean refrigerioTomado,
            double tiempoInicioRefrigerio, double duracionRefrigerio, List<EventoSimulacion> eventosFase) {

        tiempoActual = manejarRefrigerio(unidad, tiempoActual, refrigerioTomado, tiempoInicioRefrigerio,
                duracionRefrigerio, tiempoFinMaxHoras, contexto, horaBase, nodoActual, eventosFase).tiempoActual();

        if (tiempoActual >= tiempoFinMaxHoras) {
            return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, true);
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
            return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, true);
        }

        ResultadoTramo resultado = recorrerCamino(caminoRetorno, unidad, null, contexto, horaBase, velocidad, costoKm,
                tiempoActual, distanciaRecorrida, tiempoFinMaxHoras, eventosFase, TipoEvento.MOVIMIENTO_TRAMO, null);

        boolean llego = !resultado.interrumpido && resultado.nodoFinal.equals(destino.getPosicion());
        if (llego) {
            unidad.registrarPuntoTrayectoria(destino.getPosicion(), instanteDe(contexto, resultado.tiempo),
                    ActividadVehiculo.INACTIVO);
            eventosFase.add(new EventoSimulacion(resultado.tiempo, horaBase, TipoEvento.LLEGADA_ALMACEN,
                    unidad.getIdUnidad(), null, destino.getPosicion().x(), destino.getPosicion().y(),
                    String.format("Vehículo %s arribó exitosamente a su almacén de retorno", unidad.getIdUnidad()),
                    String.format(Locale.US, "Jornada completada | Dist total: %.1f km | Costo total: S/ %.2f",
                            resultado.distancia, resultado.distancia * costoKm)));
        }
        return new ResultadoTramo(resultado.tiempo, resultado.distancia, resultado.nodoFinal, !llego);
    }

    /** {@code pausaRefrigerio}: el viaje se detuvo (sin interrumpirse) porque llegó la hora límite del refrigerio. */
    private record ResultadoTramo(double tiempo, double distancia, Nodo nodoFinal, boolean interrumpido,
            boolean pausaRefrigerio) {
        ResultadoTramo(double tiempo, double distancia, Nodo nodoFinal, boolean interrumpido) {
            this(tiempo, distancia, nodoFinal, interrumpido, false);
        }
    }

    private record ResultadoRefrigerio(double tiempoActual, boolean refrigerioTomado) {
    }

    /**
     * Maneja el refrigerio obligatorio de forma persistente entre lotes, igual que
     * {@link ParadaPlanificada#getHoraInicioServicio()} para el servicio de entrega: ancla el
     * inicio real a un instante absoluto ({@link UnidadTransporte#getHoraRefrigerioProgramada()})
     * en vez de recalcularlo cada lote desde el instante actual. Bug real corregido: antes, si la
     * duración del refrigerio no cabía en una sola ventana de lote, el refrigerio se "reiniciaba"
     * cada lote sin avanzar nunca -- consumía toda la ventana del lote en un intento fallido,
     * dejando al vehículo (y su entrega en curso) congelado para siempre, incluso con la flota
     * completa saturada de forma permanente (confirmado empíricamente: 0 entregas nuevas durante
     * 3+ días simulados antes de este fix).
     */
    private ResultadoRefrigerio manejarRefrigerio(UnidadTransporte unidad, double tiempoActual,
            boolean refrigerioTomado, double tiempoInicioRefrigerio, double duracionRefrigerio,
            double tiempoFinMaxHoras, ContextoProblema contexto, double horaBase, Nodo nodoActual,
            List<EventoSimulacion> eventosFase) {
        if (refrigerioTomado || tiempoActual < tiempoInicioRefrigerio || tiempoActual >= tiempoFinMaxHoras) {
            return new ResultadoRefrigerio(tiempoActual, refrigerioTomado);
        }

        LocalDateTime horaInicioReal = unidad.getHoraRefrigerioProgramada();
        unidad.registrarPuntoTrayectoria(nodoActual, instanteDe(contexto, tiempoActual), ActividadVehiculo.EN_REFRIGERIO);
        if (horaInicioReal == null) {
            horaInicioReal = contexto.marcaTiempoActual().plusSeconds(Math.round(tiempoActual * 3600.0));
            unidad.setHoraRefrigerioProgramada(horaInicioReal);
            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, TipoEvento.INICIO_REFRIGERIO,
                    unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                    String.format(Locale.US, "Conductor de %s inicia pausa obligatoria de refrigerio (%.1fh)",
                            unidad.getIdUnidad(), duracionRefrigerio),
                    String.format("Pausa en %s | Turno: %02d:00", nodoActual, (int) horaBase)));
        }

        LocalDateTime horaFinAbs = horaInicioReal.plusSeconds(Math.round(duracionRefrigerio * 3600.0));
        double tiempoFinRelativo = horasDesdeAnchor(contexto, horaFinAbs);
        if (tiempoFinRelativo > tiempoFinMaxHoras) {
            unidad.setActividadActual(ActividadVehiculo.EN_REFRIGERIO);
            return new ResultadoRefrigerio(tiempoFinMaxHoras, false);
        }

        unidad.setHoraRefrigerioProgramada(null);
        eventosFase.add(new EventoSimulacion(Math.max(tiempoActual, tiempoFinRelativo), horaBase,
                TipoEvento.FIN_REFRIGERIO, unidad.getIdUnidad(), null, nodoActual.x(), nodoActual.y(),
                String.format("Conductor de %s finaliza refrigerio y reanuda operaciones", unidad.getIdUnidad()),
                String.format(Locale.US, "Tiempo reanudación: t=%.2fh", Math.max(tiempoActual, tiempoFinRelativo))));
        return new ResultadoRefrigerio(Math.max(tiempoActual, tiempoFinRelativo), true);
    }

    private ResultadoTramo recorrerCamino(List<Nodo> camino, UnidadTransporte unidad, String pedidoId,
            ContextoProblema contexto, double horaBase, double velocidad, double costoKm, double tiempoInicial,
            double distanciaInicial, double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase, TipoEvento tipo,
            Nodo destinoFinal) {
        return recorrerCamino(camino, unidad, pedidoId, contexto, horaBase, velocidad, costoKm, tiempoInicial,
                distanciaInicial, tiempoFinMaxHoras, eventosFase, tipo, destinoFinal, Double.MAX_VALUE);
    }

    /**
     * {@code corteRefrigerio}: instante (horas desde el ancla) a partir del cual el conductor ya
     * debe estar en refrigerio -- el viaje se detiene en el primer nodo alcanzado desde entonces,
     * incluido el destino (antes de iniciar el servicio), con {@code pausaRefrigerio}. Misma regla
     * que usan las estimaciones del planificador y {@code OrquestadorOperacion.sigueSiendoFactible}:
     * si el viaje cruza el último inicio permitido, la llegada se corre exactamente un refrigerio.
     * Antes, el simulador solo lo tomaba en el límite de un lote y el planificador solo al salir de
     * una parada: rutas que el planificador daba por puntuales se volvían infactibles a mitad de
     * camino y se abandonaban (reproducido: 2028-06-01, PED-2028-06-0523).
     */
    private ResultadoTramo recorrerCamino(List<Nodo> camino, UnidadTransporte unidad, String pedidoId,
            ContextoProblema contexto, double horaBase, double velocidad, double costoKm, double tiempoInicial,
            double distanciaInicial, double tiempoFinMaxHoras, List<EventoSimulacion> eventosFase, TipoEvento tipo,
            Nodo destinoFinal, double corteRefrigerio) {
        double tiempoActual = tiempoInicial;
        double distanciaRecorrida = distanciaInicial;
        Nodo nodoActual = camino.isEmpty() ? unidad.getPosicion() : camino.get(0);
        double kmPorCuadra = contexto.ciudad().distanciaEntreNodos();
        if (camino.size() > 1) {
            // Instante de partida: si antes hubo una pausa en este mismo nodo (entrega,
            // refrigerio), aquí termina.
            unidad.registrarPuntoTrayectoria(nodoActual, instanteDe(contexto, tiempoActual), ActividadVehiculo.VIAJANDO);
        }

        for (int i = 0; i < camino.size() - 1; i++) {
            if (tiempoActual > corteRefrigerio) {
                return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, false, true);
            }
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
                // Simplificación existente: el tramo en curso se completa al cierre del lote.
                unidad.registrarPuntoTrayectoria(destinoPaso, instanteDe(contexto, tiempoFinMaxHoras),
                        ActividadVehiculo.VIAJANDO);
                return new ResultadoTramo(tiempoFinMaxHoras, distanciaRecorrida, destinoPaso, true);
            }
            unidad.registrarPuntoTrayectoria(destinoPaso, instanteDe(contexto, tiempoActual), ActividadVehiculo.VIAJANDO);

            eventosFase.add(new EventoSimulacion(tiempoActual, horaBase, tipo, unidad.getIdUnidad(), pedidoId,
                    destinoPaso.x(), destinoPaso.y(),
                    String.format("Tránsito tramo %s -> %s", nodoActual, destinoPaso),
                    String.format(Locale.US, "Dist: %.1f km | Costo: S/ %.2f", distanciaRecorrida, costoAcum)));
            nodoActual = destinoPaso;
        }

        return new ResultadoTramo(tiempoActual, distanciaRecorrida, nodoActual, false, tiempoActual > corteRefrigerio);
    }

    private double horasDesdeAnchor(ContextoProblema contexto, LocalDateTime instante) {
        return java.time.Duration.between(contexto.marcaTiempoActual(), instante).toSeconds() / 3600.0;
    }

    public EventoSimulacion registrarBloqueoCalle(double tiempoHoras, ContextoProblema contexto, Bloqueo bloqueo) {
        Nodo primero = bloqueo.getSecuenciaNodos().get(0);
        EventoSimulacion evento = new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.INCIDENCIA_BLOQUEO, null, null, primero.x(), primero.y(),
                String.format("ALERTA VIAL: nuevo bloqueo activo sobre %s", bloqueo.getSecuenciaNodos()),
                "Estado: VÍA CLAUSURADA");
        gestorLog.registrarEvento(evento);
        return evento;
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

    /**
     * Registra que una unidad abandonó una ruta en curso (avería o mantenimiento) y sus paradas
     * pendientes quedaron liberadas para reasignación -- ver {@code OrquestadorOperacion.aplicarAveria}
     * / {@code aplicarMantenimientos}. Antes de esto, {@code TipoEvento.REPLANIFICACION_RUTAS}
     * estaba declarado pero nunca se emitía en ningún lugar del código.
     */
    public void registrarReplanificacion(double tiempoHoras, ContextoProblema contexto, String idUnidad,
            int cantidadParadasLiberadas, String motivo) {
        gestorLog.registrarEvento(new EventoSimulacion(tiempoHoras,
                contexto.marcaTiempoActual().getHour() + contexto.marcaTiempoActual().getMinute() / 60.0,
                TipoEvento.REPLANIFICACION_RUTAS, idUnidad, null, -1, -1,
                String.format("REPLANIFICACIÓN: %d parada(s) de %s liberadas y pendientes de reasignación",
                        cantidadParadasLiberadas, idUnidad),
                "Motivo: " + motivo));
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
