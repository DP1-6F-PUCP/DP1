package com.paqrap.ipso.nucleo;

/**
 * Operador de intercambio (Swap Operator, SO): intercambia los elementos de las posiciones i y j
 * de una permutación. Una secuencia de operadores de intercambio (Swap Sequence, SS) es la
 * representación discreta de "velocidad" que usa IPSO para adaptar el PSO clásico (continuo) al
 * problema combinatorio del TSP.
 */
public class OperadorIntercambio {

    private final int i;
    private final int j;

    public OperadorIntercambio(int i, int j) {
        this.i = i;
        this.j = j;
    }

    public int getI() {
        return i;
    }

    public int getJ() {
        return j;
    }

    /**
     * Aplica el intercambio in-place sobre la permutación dada.
     *
     * @param permutacion arreglo mutado in-place
     */
    public void aplicar(int[] permutacion) {
        int tmp = permutacion[i];
        permutacion[i] = permutacion[j];
        permutacion[j] = tmp;
    }
}
