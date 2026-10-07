package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Cierre planificado de un tramo de calle, vigente durante una ventana de tiempo.
 *
 * <p>Invariante: {@code secuenciaNodos} representa una polilínea abierta (el primer nodo es
 * distinto del último) de al menos 2 nodos, YA EXPANDIDA nodo a nodo (cada par consecutivo es
 * adyacente en la grilla, nunca a más de un paso) -- ver el constructor. Un nodo bloqueado no se
 * puede atravesar ni se permite girar en él; una unidad que llegue a un nodo bloqueado debe
 * regresar por el mismo tramo por el que llegó (vuelta en U). Solo {@code Bloqueo} afecta la
 * transitabilidad de la red vial — una {@link Averia} nunca bloquea el tramo donde ocurre.
 */
public class Bloqueo {

    private final List<Nodo> secuenciaNodos;
    private final LocalDateTime fechaInicio;
    private final LocalDateTime fechaFin;

    /**
     * Bug real corregido (reporte directo, con captura: un vehículo circulaba en línea recta por
     * EN MEDIO de un bloqueo largo sin llegar a cruzar ninguno de sus nodos). El formato oficial
     * del curso ({@code bloqueo.*.txt}) solo lista las ESQUINAS de la poligonal (p. ej.
     * "25,45,45,45,45,40" = 2 tramos, pero apenas 3 nodos) -- un tramo recto de la vida real puede
     * cubrir 20+ nodos de grilla entre dos esquinas consecutivas, y ni {@link #interfiereCon}
     * (que compara el tramo consultado contra pares CONSECUTIVOS de {@code secuenciaNodos}) ni la
     * exclusión de nodos de paso en {@link CalculadorDistancia} tenían forma de saber que todos
     * esos nodos intermedios también están bloqueados -- un vehículo podía viajar derecho sobre
     * ellos sin que ninguna verificación lo detectara, porque ninguno de esos nodos intermedios
     * aparecía literalmente en la lista. Se expande aquí, una sola vez al construir, a la secuencia
     * completa nodo a nodo (asumiendo tramos rectos horizontales/verticales de un paso de grilla,
     * igual que {@code CalculadorDistancia.caminoManhattan}) -- así todo consumidor aguas abajo
     * (este mismo {@code interfiereCon}, el set de nodos bloqueados, y hasta la explosión de
     * segmentos del frontend) queda correcto sin tener que reimplementar la geometría en cada uno.
     */
    private static List<Nodo> expandirPolilinea(List<Nodo> esquinas) {
        List<Nodo> densos = new ArrayList<>();
        densos.add(esquinas.get(0));
        for (int i = 0; i < esquinas.size() - 1; i++) {
            Nodo a = esquinas.get(i);
            Nodo b = esquinas.get(i + 1);
            int pasoX = Integer.compare(b.x(), a.x());
            int pasoY = Integer.compare(b.y(), a.y());
            Nodo actual = a;
            while (!actual.equals(b)) {
                actual = new Nodo(actual.x() + pasoX, actual.y() + pasoY);
                densos.add(actual);
            }
        }
        return densos;
    }

    public Bloqueo(List<Nodo> secuenciaNodos, LocalDateTime fechaInicio, LocalDateTime fechaFin) {
        if (secuenciaNodos == null || secuenciaNodos.size() < 2) {
            throw new IllegalArgumentException("La secuencia de nodos de un bloqueo debe tener al menos 2 nodos");
        }
        if (secuenciaNodos.get(0).equals(secuenciaNodos.get(secuenciaNodos.size() - 1))) {
            throw new IllegalArgumentException("La secuencia de nodos de un bloqueo debe ser una polilínea abierta");
        }
        this.secuenciaNodos = List.copyOf(expandirPolilinea(secuenciaNodos));
        this.fechaInicio = fechaInicio;
        this.fechaFin = fechaFin;
    }

    public List<Nodo> getSecuenciaNodos() {
        return secuenciaNodos;
    }

    public LocalDateTime getFechaInicio() {
        return fechaInicio;
    }

    public LocalDateTime getFechaFin() {
        return fechaFin;
    }

    /**
     * Verifica si el bloqueo está activo en el instante dado.
     *
     * @param instanteActual momento a evaluar
     * @return {@code true} si {@code instanteActual} cae dentro de [fechaInicio, fechaFin]
     */
    public boolean estaVigente(LocalDateTime instanteActual) {
        return !instanteActual.isBefore(fechaInicio) && !instanteActual.isAfter(fechaFin);
    }

    /**
     * Verifica si el tramo entre dos nodos adyacentes forma parte de la polilínea bloqueada.
     *
     * @param origen extremo de partida del tramo
     * @param destino extremo de llegada del tramo
     * @return {@code true} si el tramo (en cualquier sentido) está bloqueado por esta polilínea
     */
    public boolean interfiereCon(Nodo origen, Nodo destino) {
        for (int i = 0; i < secuenciaNodos.size() - 1; i++) {
            Nodo a = secuenciaNodos.get(i);
            Nodo b = secuenciaNodos.get(i + 1);
            boolean coincideDirecto = a.equals(origen) && b.equals(destino);
            boolean coincideInverso = a.equals(destino) && b.equals(origen);
            if (coincideDirecto || coincideInverso) {
                return true;
            }
        }
        return false;
    }

    /**
     * Recorta una lista de bloqueos a los que realmente pueden ser consultados dentro de
     * {@code [desde, hasta]}, descartando los que ya terminaron antes o empiezan después de esa
     * ventana.
     *
     * <p>{@link CalculadorDistancia} ya filtra por vigencia puntual en cada consulta
     * ({@link #estaVigente}), pero ese filtro recorre la lista completa en cada llamada — con
     * cientos de bloqueos por mes y miles de consultas por corrida, ese recorrido repetido es un
     * costo real. Recortar la lista una vez, al horizonte de la instancia que se va a planificar,
     * evita que cada consulta individual tenga que descartar bloqueos irrelevantes una y otra vez.
     *
     * @param bloqueos universo completo de bloqueos conocidos
     * @param desde inicio del horizonte de interés
     * @param hasta fin del horizonte de interés
     * @return los bloqueos cuya ventana de vigencia se solapa con {@code [desde, hasta]}
     */
    public static List<Bloqueo> filtrarEnHorizonte(List<Bloqueo> bloqueos, LocalDateTime desde, LocalDateTime hasta) {
        return bloqueos.stream()
                .filter(b -> !b.getFechaFin().isBefore(desde) && !b.getFechaInicio().isAfter(hasta))
                .toList();
    }
}
