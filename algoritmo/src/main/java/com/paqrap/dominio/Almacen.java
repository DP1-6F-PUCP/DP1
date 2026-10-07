package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Punto de abastecimiento del producto P, central o intermedio. */
public abstract class Almacen {

    // No final: TipoSolicitud.CAMBIO_POSICION_ALMACEN permite reubicar un almacen en caliente.
    private Nodo posicion;
    // movimientos nunca se recorta -- acumula TODO el historial de la vida del escenario, igual
    // que UnidadTransporte.rutas (ver su comentario). Por eso tampoco puede ser
    // CopyOnWriteArrayList: acceso encapsulado y sincronizado en su lugar (mutación O(1) vía
    // registrarMovimiento(), lectura vía getMovimientos() sobre copia defensiva).
    private final List<MovimientoInventario> movimientos = new ArrayList<>();

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
        movimientos.add(new MovimientoInventario(tipo, cantidad, instante));
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
