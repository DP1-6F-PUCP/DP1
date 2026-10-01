package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Punto de abastecimiento del producto P, central o intermedio. */
public abstract class Almacen {

    private final Nodo posicion;
    private final List<MovimientoInventario> movimientos = new ArrayList<>();

    protected Almacen(Nodo posicion) {
        this.posicion = posicion;
    }

    public Nodo getPosicion() {
        return posicion;
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
    public List<MovimientoInventario> getMovimientos() {
        return movimientos;
    }

    protected void registrarMovimiento(TipoMovimiento tipo, int cantidad, LocalDateTime instante) {
        movimientos.add(new MovimientoInventario(tipo, cantidad, instante));
    }
}
