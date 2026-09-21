package com.paqrap.exposicion;

/**
 * Parámetro práctico para {@link ServicioPlanificacion#recibirArchivo}: el diagrama declara un
 * único parámetro {@code archivo} sin tipar; se necesita tanto el nombre (para inferir
 * {@link com.paqrap.dominio.TipoArchivo} y el período) como el contenido ya leído, así que se
 * agrupan aquí en vez de forzar un solo parámetro ambiguo.
 *
 * @param nombreArchivo nombre del archivo, siguiendo la convención oficial del curso (p.ej. {@code ventas.202601.txt})
 * @param contenido contenido completo del archivo, ya leído como texto
 */
public record ArchivoEntrada(String nombreArchivo, String contenido) {
}
