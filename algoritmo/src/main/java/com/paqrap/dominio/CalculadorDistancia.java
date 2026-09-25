package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * Servicio de dominio, sin estado, que calcula distancias y caminos sobre la red vial.
 *
 * <p>Estrategia en 3 pasos, de más barato a más caro:
 * <ol>
 *   <li><b>Filtro temporal</b>: solo se consideran los bloqueos vigentes en {@code instante}.</li>
 *   <li><b>Camino directo</b>: se prueba el camino Manhattan (línea recta en la grilla, O(1)) y se
 *       verifica —de forma exacta, no aproximada— si algún bloqueo vigente interfiere con alguno de
 *       sus tramos. La mayoría de consultas caen aquí: que exista <em>algún</em> bloqueo vigente en
 *       la ciudad en ese instante no implica que interfiera con este origen-destino en particular.</li>
 *   <li><b>A* con heurística Manhattan</b>: solo si el camino directo está realmente bloqueado. La
 *       heurística es admisible y consistente (movimientos de costo uniforme en 4 direcciones), así
 *       que A* explora muchos menos nodos que un BFS a ciegas para encontrar el mismo camino óptimo.</li>
 * </ol>
 */
public final class CalculadorDistancia {

    private CalculadorDistancia() {
    }

    /**
     * Calcula la distancia en kilómetros entre dos nodos, considerando los bloqueos vigentes.
     *
     * @param ciudad configuración de la red vial
     * @param bloqueos bloqueos conocidos (se filtran los vigentes en {@code instante})
     * @param instante momento de referencia para evaluar vigencia de bloqueos
     * @param origen nodo de partida
     * @param destino nodo de llegada
     * @return distancia en kilómetros del camino más corto transitable
     */
    public static double distanciaKm(Ciudad ciudad, List<Bloqueo> bloqueos, LocalDateTime instante, Nodo origen,
            Nodo destino) {
        List<Nodo> camino = caminoMasCorto(ciudad, bloqueos, instante, origen, destino);
        if (camino.size() < 2) {
            return 0.0;
        }
        return (camino.size() - 1) * (double) ciudad.distanciaEntreNodos();
    }

    /**
     * Calcula el camino más corto transitable entre dos nodos, considerando los bloqueos vigentes.
     *
     * @param ciudad configuración de la red vial
     * @param bloqueos bloqueos conocidos (se filtran los vigentes en {@code instante})
     * @param instante momento de referencia para evaluar vigencia de bloqueos
     * @param origen nodo de partida
     * @param destino nodo de llegada
     * @return secuencia de nodos desde {@code origen} hasta {@code destino}, ambos incluidos
     * @throws IllegalStateException si no existe camino transitable entre ambos nodos
     */
    public static List<Nodo> caminoMasCorto(Ciudad ciudad, List<Bloqueo> bloqueos, LocalDateTime instante,
            Nodo origen, Nodo destino) {
        List<Bloqueo> vigentes = bloqueos.stream().filter(bloqueo -> bloqueo.estaVigente(instante)).toList();
        if (vigentes.isEmpty()) {
            return caminoManhattan(ciudad, origen, destino);
        }
        List<Nodo> candidato = caminoManhattan(ciudad, origen, destino);
        if (caminoLibre(candidato, vigentes)) {
            return candidato;
        }
        List<Nodo> caminoAEstrella = caminoPorAEstrella(ciudad, vigentes, origen, destino);
        if (caminoAEstrella == null) {
            throw new IllegalStateException("No existe camino transitable entre " + origen + " y " + destino);
        }
        return caminoAEstrella;
    }

    private static boolean caminoLibre(List<Nodo> camino, List<Bloqueo> vigentes) {
        for (int i = 0; i < camino.size() - 1; i++) {
            Nodo actual = camino.get(i);
            Nodo siguiente = camino.get(i + 1);
            if (vigentes.stream().anyMatch(bloqueo -> bloqueo.interfiereCon(actual, siguiente))) {
                return false;
            }
        }
        return true;
    }

    private static List<Nodo> caminoManhattan(Ciudad ciudad, Nodo origen, Nodo destino) {
        int paso = ciudad.distanciaEntreNodos();
        List<Nodo> camino = new ArrayList<>();
        int x = origen.x();
        int y = origen.y();
        camino.add(new Nodo(x, y));
        int dirX = Integer.compare(destino.x(), x);
        while (x != destino.x()) {
            x += dirX * paso;
            camino.add(new Nodo(x, y));
        }
        int dirY = Integer.compare(destino.y(), y);
        while (y != destino.y()) {
            y += dirY * paso;
            camino.add(new Nodo(x, y));
        }
        return camino;
    }

    private record NodoConPrioridad(Nodo nodo, int f) {
    }

    private static List<Nodo> caminoPorAEstrella(Ciudad ciudad, List<Bloqueo> vigentes, Nodo origen, Nodo destino) {
        int paso = ciudad.distanciaEntreNodos();
        int[][] direcciones = {{paso, 0}, {-paso, 0}, {0, paso}, {0, -paso}};

        Map<Nodo, Integer> costoG = new HashMap<>();
        Map<Nodo, Nodo> predecesores = new HashMap<>();
        Set<Nodo> cerrados = new HashSet<>();
        PriorityQueue<NodoConPrioridad> abiertos = new PriorityQueue<>((a, b) -> Integer.compare(a.f(), b.f()));

        costoG.put(origen, 0);
        abiertos.add(new NodoConPrioridad(origen, heuristicaManhattan(origen, destino, paso)));

        while (!abiertos.isEmpty()) {
            Nodo actual = abiertos.poll().nodo();
            if (!cerrados.add(actual)) {
                continue;
            }
            if (actual.equals(destino)) {
                return reconstruirCamino(predecesores, origen, destino);
            }
            for (int[] direccion : direcciones) {
                Nodo vecino = new Nodo(actual.x() + direccion[0], actual.y() + direccion[1]);
                if (!ciudad.esNodoValido(vecino) || cerrados.contains(vecino)) {
                    continue;
                }
                boolean tramoBloqueado = vigentes.stream().anyMatch(bloqueo -> bloqueo.interfiereCon(actual, vecino));
                if (tramoBloqueado) {
                    continue;
                }
                int nuevoCosto = costoG.get(actual) + 1;
                if (nuevoCosto < costoG.getOrDefault(vecino, Integer.MAX_VALUE)) {
                    costoG.put(vecino, nuevoCosto);
                    predecesores.put(vecino, actual);
                    abiertos.add(new NodoConPrioridad(vecino, nuevoCosto + heuristicaManhattan(vecino, destino, paso)));
                }
            }
        }
        return null;
    }

    /** Heurística admisible y consistente: distancia Manhattan en cantidad de saltos de la grilla. */
    private static int heuristicaManhattan(Nodo a, Nodo b, int paso) {
        return (Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y())) / paso;
    }

    private static List<Nodo> reconstruirCamino(Map<Nodo, Nodo> predecesores, Nodo origen, Nodo destino) {
        LinkedList<Nodo> camino = new LinkedList<>();
        Nodo actual = destino;
        while (!actual.equals(origen)) {
            camino.addFirst(actual);
            actual = predecesores.get(actual);
        }
        camino.addFirst(origen);
        return camino;
    }
}
