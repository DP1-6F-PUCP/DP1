import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Layers, Loader2, Package, RotateCcw, Trash2, Upload, Wrench, X, Zap } from 'lucide-react';
import { CategoriaArchivo, useSubidaArchivos } from '../hooks/useSubidaArchivos';
import type { ArchivoCargadoDTO } from '../../../types/backend';
// Mismas piezas visuales que el resto de Configuración (antes se duplicaban aquí).
import { BORDE, cuenta, TEXTO_FUERTE, TEXTO_TENUE } from '../../configuracion/components/ui';

/**
 * Carga masiva de los archivos del caso (POST /api/files/orders | blocked-streets | maintenance).
 * Cada archivo se aplica en el backend AL SUBIRLO (no hay paso de "aplicar"): antes de simular,
 * queda para la próxima ejecución; con una en curso, sus datos se incorporan a ella de inmediato.
 * El backend rechaza el archivo entero si alguna línea es inválida (no aplica nada a medias).
 *
 * Antes había una 4.ª tarjeta "Almacenes y flota" que solo mostraba el nombre del archivo elegido:
 * el backend no tiene endpoint para eso. La flota y los almacenes se configuran en sus bloques.
 */

const TARJETAS: {
  categoria: CategoriaArchivo;
  titulo: string;
  descripcion: string;
  ejemplo: string;
  accept: string;
  Icono: typeof Layers;
  acento: string;
}[] = [
  {
    categoria: 'orders',
    titulo: 'Pedidos (ventas)',
    descripcion: 'Pedidos con destino, cantidad de paquetes y plazo de entrega.',
    ejemplo: 'ventas202609.txt',
    accept: '.txt,.csv',
    Icono: Package,
    acento: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  },
  {
    categoria: 'blockages',
    titulo: 'Tramos bloqueados',
    descripcion: 'Calles cerradas por intervalos de tiempo en la cuadrícula de la ciudad.',
    ejemplo: '202609.bloqueadas',
    accept: '.bloqueadas,.txt,.csv',
    Icono: Layers,
    acento: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  },
  {
    categoria: 'maintenance',
    titulo: 'Mantenimiento preventivo',
    descripcion: 'Días de mantenimiento programado por vehículo (de 00:00 a 23:59).',
    ejemplo: 'mant.preventivo.09.10',
    // Los nombres oficiales terminan en el bimestre (".09.10"): sin filtro de extensión.
    accept: '',
    Icono: Wrench,
    acento: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  },
];

export const CargaMasivaArchivos: React.FC<{ enCaliente: boolean }> = ({ enCaliente }) => {
  const {
    procesarArchivos, cargados, borrarArchivo, limpiarTodo, borrarTodo, restaurarEstandar,
    estado, cerrarEstado, isUploading, uploadingCategory, uploadProgress,
  } = useSubidaArchivos();
  const [arrastrando, setArrastrando] = useState<CategoriaArchivo | null>(null);
  // Lo que dice el servidor: subidos a mano por categoría y resumen de los precargados.
  const manuales = cargados.filter((c) => c.origen === 'MANUAL');
  const archivos: Record<CategoriaArchivo, ArchivoCargadoDTO[]> = {
    orders: manuales.filter((c) => c.tipoArchivo === 'PEDIDOS'),
    blockages: manuales.filter((c) => c.tipoArchivo === 'BLOQUEOS'),
    maintenance: manuales.filter((c) => c.tipoArchivo === 'MANTENIMIENTO'),
  };
  const total = manuales.length;
  const precargados = cargados.filter((c) => c.origen === 'OFFICIAL');
  const resumenPrecargado = (tipo: ArchivoCargadoDTO['tipoArchivo'], nombre: string) => {
    const deTipo = precargados.filter((c) => c.tipoArchivo === tipo);
    const filas = deTipo.reduce((s, c) => s + c.filas, 0);
    return `${nombre} ${filas.toLocaleString('es-PE')}`;
  };

  const subir = async (categoria: CategoriaArchivo, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await procesarArchivos(categoria, files);
  };

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${enCaliente
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'
        : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100'}`}>
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          {/* Corto a propósito: el ejemplo de nombre ya está en cada tarjeta y el detalle del formato,
              en el tooltip. Lo que importa al operador: cuándo tiene efecto. */}
          <strong>{enCaliente ? 'Entra al subir.' : 'Se usa en la próxima simulación.'}</strong>
          <span title="El mes sale del nombre del archivo (p. ej. ventas.202609.txt = septiembre 2026). Si una línea tiene mal formato, se rechaza el archivo entero.">
            {' '}El mes sale del nombre del archivo.
          </span>
        </p>
      </div>

      {estado && (
        <div role={estado.tipo === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estado.tipo === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100'
            : estado.tipo === 'info'
              // Subida correcta pero con pedidos que no entraron (vencidos o anteriores al inicio).
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>
          {estado.tipo !== 'success'
            ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1 break-words">{estado.mensaje}</span>
          <button type="button" onClick={cerrarEstado} aria-label="Cerrar mensaje" className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {TARJETAS.map(({ categoria, titulo, descripcion, ejemplo, accept, Icono, acento }) => {
          const lista = archivos[categoria];
          const registros = lista.reduce((s, f) => s + f.filas, 0);
          const subiendo = uploadingCategory === categoria;
          return (
            <section key={categoria} className={`flex min-w-0 flex-col rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
              <header className={`border-b ${BORDE} px-4 py-3`}>
                <h3 className={`flex items-center gap-2 text-sm font-semibold ${TEXTO_FUERTE}`}>
                  <span className={`rounded-md p-1 ${acento}`}><Icono className="h-4 w-4" aria-hidden /></span>{titulo}
                </h3>
                <p className={`mt-1 text-xs ${TEXTO_TENUE}`}>{descripcion}</p>
              </header>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <label
                  onDragOver={(e) => { e.preventDefault(); setArrastrando(categoria); }}
                  onDragLeave={() => setArrastrando(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastrando(null);
                    const soltados = Array.from(e.dataTransfer.files ?? []);
                    if (soltados.length > 0 && !isUploading) void procesarArchivos(categoria, soltados);
                  }}
                  className={`flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center text-xs transition focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 ${
                    arrastrando === categoria ? 'border-blue-500 bg-blue-500/5' : `${BORDE} hover:border-blue-400 dark:hover:border-blue-500`
                  } ${isUploading && !subiendo ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {subiendo ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-hidden /> : <Upload className={`h-5 w-5 ${TEXTO_TENUE}`} aria-hidden />}
                  <span className={`font-medium ${TEXTO_FUERTE}`}>
                    {subiendo
                      ? `Subiendo${uploadProgress ? ` ${uploadProgress.actual}/${uploadProgress.total}` : ''}…`
                      : 'Elegir o arrastrar'}
                  </span>
                  <span className={TEXTO_TENUE}>Ej.: <span className="font-mono-code">{ejemplo}</span></span>
                  <input type="file" multiple accept={accept || undefined}className="sr-only" disabled={isUploading}
                    aria-label={`Subir archivos de ${titulo.toLowerCase()}`} onChange={(e) => void subir(categoria, e)} />
                </label>

                <div className="min-w-0">
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${TEXTO_TENUE}`}>
                    {lista.length > 0 ? `Subidos · ${cuenta(lista.length, 'archivo', 'archivos')} · ${registros.toLocaleString('es-PE')} reg.` : 'Nada subido'}
                  </p>
                  {/* Lista del servidor (sobrevive a recargar la página); cada archivo se borra con sus datos. */}
                  {lista.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {lista.map((f) => (
                        <li key={f.id} title={`${f.nombreArchivo} (${f.filas.toLocaleString('es-PE')} registros)`}
                          className={`flex items-center gap-2 rounded-md border ${BORDE} bg-slate-50 px-2 py-1 text-xs dark:bg-slate-900/60`}>
                          <FileText className={`h-3.5 w-3.5 shrink-0 ${TEXTO_TENUE}`} aria-hidden />
                          <span className={`min-w-0 flex-1 truncate font-mono-code ${TEXTO_FUERTE}`}>{f.nombreArchivo}</span>
                          <span className={`shrink-0 font-mono-code ${TEXTO_TENUE}`}>{f.filas.toLocaleString('es-PE')}</span>
                          <button type="button" onClick={() => void borrarArchivo(f)} disabled={isUploading}
                            title="Borrar este archivo y sus datos" aria-label={`Borrar ${f.nombreArchivo}`}
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${BORDE} bg-[var(--color-surface)] px-4 py-3`}>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${TEXTO_FUERTE}`}>Borrar datos cargados manualmente</p>
          <p className={`text-xs ${TEXTO_TENUE}`}>
            Solo los subidos a mano; los estándar se mantienen.
            {enCaliente && ' No retira lo que la simulación en curso ya incorporó.'}
          </p>
        </div>
        {/* limpiarTodo pide la reconfirmación (components/Confirmacion). */}
        {/* Botón de una palabra; el conteo va en el tooltip. */}
        <button type="button" onClick={() => void limpiarTodo()} disabled={isUploading}
          title={total > 0 ? `${cuenta(total, 'archivo', 'archivos')} en la lista` : 'Borrar los datos subidos a mano'}
          // Destructivo: rojo también en reposo (mismo estilo que «Descartar» del diálogo de salida).
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40">
          <Trash2 className="h-4 w-4" aria-hidden />Borrar
        </button>
      </div>

      {/* Prueba de "sistema sin datos" (pedido del profesor): borra también los estándar precargados.
          «Cargar» los vuelve a traer; también se recuperan solos al reiniciar el sistema. */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${BORDE} bg-[var(--color-surface)] px-4 py-3`}>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${TEXTO_FUERTE}`}>Datos precargados</p>
          <p className={`text-xs ${TEXTO_TENUE}`}>
            {precargados.length === 0
              ? <span className="font-medium text-rose-600 dark:text-rose-400">Sin datos precargados: usa «Cargar».</span>
              : <>{resumenPrecargado('PEDIDOS', 'Pedidos')} · {resumenPrecargado('BLOQUEOS', 'Calles')} · {resumenPrecargado('MANTENIMIENTO', 'Mant.')}</>}
            {enCaliente && ' · La simulación en curso conserva lo que ya tenía.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void restaurarEstandar()} disabled={isUploading}
            title="Volver a cargar los datos precargados que falten"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            <RotateCcw className="h-4 w-4" aria-hidden />Cargar
          </button>
          <button type="button" onClick={() => void borrarTodo()} disabled={isUploading || cargados.length === 0}
            title="Borrar todos los datos: precargados y subidos a mano"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">
            <Trash2 className="h-4 w-4" aria-hidden />Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
};
