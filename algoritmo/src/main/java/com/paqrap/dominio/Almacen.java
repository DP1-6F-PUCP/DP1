package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Punto de abastecimiento del producto P, central o intermedio. */
public abstract class Almacen {

    // No final: TipoSolicitud.CAMBIO_POSICION_ALMACEN permite reubicar un almacen en caliente.
    private Nodo posicion;
    // Solo los últimos MAX_MOVIMIENTOS: antes acumulaba TODO el historial (un movimiento por cada
    // despacho planificado), y como los almacenes son los mismos objetos para todas las
    // ejecuciones del backend, crecía sin límite hasta reiniciar el servidor -- sin que nadie lo
    // leyera (ni el front: el listado de pedidos por almacén sale del origen de cada pedido).
    private static final int MAX_MOVIMIENTOS = 1000;
    private final java.util.ArrayDeque<MovimientoInventario> movimientos = new java.util.ArrayDeque<>();

    protected Almacen(Nodo posicion) {
        this.posicion = posicion;
    }

    public Nodo getPosicion() {
        return posicion;
    }

    public void setPosicion(Nodo posicion) {
        this.posicion = posicion;
    }

    /**
     * Verifica si el almacén puede despachar la cantidad solicitada.
     *
     * @param cantidad unidades de producto P requeridas
     * @return {@code true} si el almacén tiene stock suficiente
     */
    public abstract boolean tieneStock(int cantidad);

    /**
     * Descuenta stock del almacén tras un despacho.
     *
     * @param cantidad unidades de producto P despachadas
     * @param instante momento del despacho, para el {@link MovimientoInventario} registrado
     */
    public abstract void descontarStock(int cantidad, LocalDateTime instante);

    /**
     * Repone el stock del almacén a su capacidad máxima (recarga diaria a las 23:59:59).
     *
     * @param instante momento de la recarga, para el {@link MovimientoInventario} registrado
     */
    public abstract void recargar(LocalDateTime instante);

    /**
     * Historial de movimientos de inventario de este almacén, en el orden en que ocurrieron.
     * Antes de esto, {@link MovimientoInventario}/{@link TipoMovimiento} estaban declarados en el
     * dominio pero nada los instanciaba en ningún lugar del código.
     */
    public synchronized List<MovimientoInventario> getMovimientos() {
        return new ArrayList<>(movimientos);
    }

    protected synchronized void registrarMovimiento(TipoMovimiento tipo, int cantidad, LocalDateTime instante) {
        movimientos.addLast(new MovimientoInventario(tipo, cantidad, instante));
        if (movimientos.size() > MAX_MOVIMIENTOS) {
            movimientos.removeFirst();
        }
    }

    /**
     * Devuelve paquetes al almacén: una reserva que no se llegó a cargar (la ruta se abandonó antes
     * de pasar a cargar) o el sobrante que trae una unidad al llegar. El central tiene inventario
     * infinito, así que ahí no cambia nada.
     */
    public void reponerStock(int cantidad, LocalDateTime instante) {
        // por defecto (central): sin efecto
    }

    /**
     * Almacén de {@code almacenes} más cercano a {@code desde} por distancia Manhattan (criterio
     * de SELECCIÓN del destino de retorno, no el camino en sí -- no considera bloqueos). Antes
     * existían 2 copias privadas idénticas de esta misma lógica (MotorSimulacion,
     * VerificadorRestricciones); consolidado aquí para que, en particular,
     * {@code EnsambladorRespuestas} pueda calcular el camino de regreso expuesto al frontend
     * eligiendo exactamente el mismo almacén que la simulación real usó.
     */
    public static Almacen masCercano(List<Almacen> almacenes, Nodo desde) {
        return almacenes.stream()
                .min(java.util.Comparator.comparingInt(a -> Math.abs(a.getPosicion().x() - desde.x())
                        + Math.abs(a.getPosicion().y() - desde.y())))
                .orElse(null);
    }

    /**
     * Variante de {@link #masCercano(List, Nodo)} para cuando el propósito es que una unidad
     * REGRESE a recargar -- regla dura del curso (CSV oficial de preguntas y respuestas, pregunta
     * 10): "las unidades de transporte no pueden regresar a un almacén que no tiene stock."
     * {@link AlmacenCentral} siempre pasa el filtro (stock infinito), así que esto nunca devuelve
     * {@code null} mientras exista al menos un almacén en la lista.
     */
    public static Almacen masCercanoConStock(List<Almacen> almacenes, Nodo desde) {
        List<Almacen> conStock = almacenes.stream().filter(a -> a.tieneStock(1)).toList();
        return masCercano(conStock, desde);
    }
}
