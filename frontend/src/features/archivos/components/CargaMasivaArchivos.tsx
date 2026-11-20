import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Layers, Loader2, Package, Trash2, Upload, Wrench, X, Zap } from 'lucide-react';
import { CategoriaArchivo, useSubidaArchivos } from '../hooks/useSubidaArchivos';

/**
 * Carga masiva de los archivos del caso (POST /api/files/orders | blocked-streets | maintenance).
 * Cada archivo se aplica en el backend AL SUBIRLO (no hay paso de "aplicar"): antes de simular,
 * queda para la próxima ejecución; con una en curso, sus datos se incorporan a ella de inmediato.
 * El backend rechaza el archivo entero si alguna línea es inválida (no aplica nada a medias).
 *
 * Antes había una 4.ª tarjeta "Almacenes y flota" que solo mostraba el nombre del archivo elegido:
 * el backend no tiene endpoint para eso. La flota y los almacenes se configuran en sus bloques.
 */
const BORDE = 'border-slate-200 dark:border-slate-700/70';
const TEXTO_FUERTE = 'text-slate-900 dark:text-slate-100';
const TEXTO_TENUE = 'text-slate-500 dark:text-slate-400';

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
    blockageFiles, ordersFiles, maintenanceFiles, procesarArchivos, eliminarArchivo, limpiarTodo,
    estado, cerrarEstado, isUploading, uploadingCategory, uploadProgress,
  } = useSubidaArchivos();
  const [arrastrando, setArrastrando] = useState<CategoriaArchivo | null>(null);
  const archivos = { blockages: blockageFiles, orders: ordersFiles, maintenance: maintenanceFiles };
  const total = blockageFiles.length + ordersFiles.length + maintenanceFiles.length;

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
          {enCaliente
            ? <><strong>Se aplica al subir, sin pasar por «Aplicar».</strong> Hay una simulación en curso: los datos válidos se incorporan a ella de inmediato.</>
            : <><strong>Se aplica al subir, sin pasar por «Guardar».</strong> Los datos quedan cargados para la próxima simulación.</>}
          {' '}El periodo (año y mes) se toma del nombre del archivo, p. ej. <span className="font-mono-code">202609</span>. Si una línea es inválida, se rechaza el archivo completo.
          {' '}Sin subir nada, la simulación usa los archivos oficiales del curso.
        </p>
      </div>

      {estado && (
        <div role={estado.tipo === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estado.tipo === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>
          {estado.tipo === 'error'
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
          const registros = lista.reduce((s, f) => s + f.count, 0);
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
                      : 'Elegir archivos o arrastrarlos aquí'}
                  </span>
                  <span className={TEXTO_TENUE}>Ej.: <span className="font-mono-code">{ejemplo}</span></span>
                  <input type="file" multiple accept={accept || undefined}className="sr-only" disabled={isUploading}
                    aria-label={`Subir archivos de ${titulo.toLowerCase()}`} onChange={(e) => void subir(categoria, e)} />
                </label>

                <div className="min-w-0">
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${TEXTO_TENUE}`}>
                    {lista.length > 0 ? `Subidos en esta sesión · ${lista.length} arch. · ${registros.toLocaleString('es-PE')} reg.` : 'Nada subido en esta sesión'}
                  </p>
                  {lista.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {lista.map((f) => (
                        <li key={f.name} title={`${f.name} (${f.count} registros)`}
                          className={`flex items-center gap-2 rounded-md border ${BORDE} bg-slate-50 px-2 py-1 text-xs dark:bg-slate-900/60`}>
                          <FileText className={`h-3.5 w-3.5 shrink-0 ${TEXTO_TENUE}`} aria-hidden />
                          <span className={`min-w-0 flex-1 truncate font-mono-code ${TEXTO_FUERTE}`}>{f.name}</span>
                          <span className={`shrink-0 font-mono-code ${TEXTO_TENUE}`}>{f.count.toLocaleString('es-PE')}</span>
                          {/* Solo la quita de esta lista: el backend no permite borrar un archivo suelto. */}
                          <button type="button" onClick={() => eliminarArchivo(categoria, f.name)}
                            title="Quitar de la lista (no deshace la carga en el servidor)" aria-label={`Quitar ${f.name} de la lista`}
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                            <X className="h-3.5 w-3.5" />
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
            Elimina del servidor todos los pedidos, bloqueos y mantenimientos subidos a mano (no los oficiales del curso).
            {enCaliente && ' No retira los que la simulación en curso ya incorporó.'}
          </p>
        </div>
        {/* limpiarTodo pide la reconfirmación (components/Confirmacion). */}
        <button type="button" onClick={() => void limpiarTodo()} disabled={isUploading}
          className={`inline-flex items-center gap-1.5 rounded-lg border ${BORDE} px-3 py-1.5 text-sm text-slate-700 hover:border-rose-400 hover:text-rose-600 disabled:opacity-50 dark:text-slate-300 dark:hover:text-rose-400`}>
          <Trash2 className="h-4 w-4" aria-hidden />Borrar{total > 0 ? ` (${total} en la lista)` : ''}
        </button>
      </div>
    </div>
  );
};
