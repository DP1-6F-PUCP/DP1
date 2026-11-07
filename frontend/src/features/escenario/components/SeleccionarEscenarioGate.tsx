import React, { useEffect, useRef, useState } from 'react';
import { useEscenario } from '../hooks/useEscenario';
import { useDescubrirEjecucionActiva } from '../../../hooks/useDescubrirEjecucionActiva';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useConfigInicialStore } from '../../../store/configInicialStore';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { useSubidaArchivos, CategoriaArchivo } from '../../archivos/hooks/useSubidaArchivos';
import { formatDateForInput } from '../../../utils/simulation';
import {
  Play,
  Loader2,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);
const FECHA_MIN_DATOS = '2026-01-01';
const FECHA_MAX_DATOS = '2028-12-31';

interface UploadCardProps {
  titulo: string;
  subtitulo: string;
  categoria: CategoriaArchivo;
  esObligatorio: boolean;
  archivos: Array<{ name: string; count: number }>;
  unidadConteo: string;
  extensiones: string;
  isUploading: boolean;
  isUploadingThisCard: boolean;
  uploadProgress: { actual: number; total: number } | null;
  onSubir: (categoria: CategoriaArchivo, files: File[]) => Promise<void>;
  onEliminar: (categoria: CategoriaArchivo, nombre: string) => void;
}

const UploadCard: React.FC<UploadCardProps> = ({
  titulo,
  subtitulo,
  categoria,
  esObligatorio,
  archivos,
  unidadConteo,
  extensiones,
  isUploading,
  isUploadingThisCard,
  uploadProgress,
  onSubir,
  onEliminar,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void onSubir(categoria, Array.from(files));
  };

  const tieneArchivos = archivos.length > 0;
  const totalRegistros = archivos.reduce((acc, a) => acc + a.count, 0);

  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-200 min-w-0 ${
        isUploadingThisCard
          ? 'border-blue-400 bg-blue-50/40 dark:border-blue-700 dark:bg-blue-950/25'
          : tieneArchivos
          ? 'border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20'
          : esObligatorio
          ? 'border-amber-300/80 bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/20'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span className="truncate">{titulo}</span>
              {isUploadingThisCard ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
              ) : (
                tieneArchivos && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {isUploadingThisCard
                ? `Subiendo ${uploadProgress ? `${uploadProgress.actual}/${uploadProgress.total}` : ''} archivo(s)...`
                : tieneArchivos
                ? `${archivos.length} archivo(s) · ${totalRegistros.toLocaleString('es-PE')} ${unidadConteo}`
                : subtitulo}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
              isUploadingThisCard
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                : tieneArchivos
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                : esObligatorio
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {isUploadingThisCard ? 'Cargando' : tieneArchivos ? 'Listo' : esObligatorio ? 'Obligatorio' : 'Opcional'}
          </span>
        </div>

        {/* Estado de carga con spinner o lista de archivos */}
        {isUploadingThisCard ? (
          <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-blue-200/80 bg-white/80 py-6 px-3 text-center dark:border-blue-800/50 dark:bg-slate-900/70">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400 mb-2" />
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              Procesando y subiendo archivos...
            </p>
            {uploadProgress && (
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                {uploadProgress.actual} de {uploadProgress.total} completado(s)
              </p>
            )}
          </div>
        ) : tieneArchivos ? (
          <div className="mt-3 max-h-36 overflow-y-auto pr-1 space-y-1.5">
            {archivos.map((archivo) => (
              <div
                key={archivo.name}
                title={`${archivo.name} (${archivo.count} ${unidadConteo})`}
                className="flex items-center justify-between gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs border border-emerald-200 dark:border-emerald-800/50 dark:bg-slate-800/80"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    {archivo.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="rounded bg-emerald-100/80 dark:bg-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
                    {archivo.count}
                  </span>
                  <button
                    type="button"
                    title={`Eliminar ${archivo.name}`}
                    onClick={() => onEliminar(categoria, archivo.name)}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className={`mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed py-4 px-2 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-800/40'
            }`}
          >
            <Upload className="h-5 w-5 text-slate-400 dark:text-slate-500 mb-1" />
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Arrastra o haz clic para subir
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Formatos: {extensiones}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-end">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={extensiones}
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
        >
          {isUploadingThisCard ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Subiendo...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              <span>{tieneArchivos ? 'Agregar más' : 'Seleccionar archivo'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export const SeleccionarEscenarioGate: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { ejecucion, iniciarEscenario, isIniciando, error } = useEscenario();
  const { verificando } = useDescubrirEjecucionActiva();
  const { warehouses } = useEstadoOperacion();
  const tipo = useScenarioStore((s) => s.selectedScenarioType);
  const ajustesPendientes = useConfigInicialStore((s) => s.ajustesPendientes);

  const {
    blockageFiles,
    ordersFiles,
    maintenanceFiles,
    procesarArchivos,
    eliminarArchivo,
    limpiarTodo,
    estado: uploadEstado,
    isUploading,
    uploadingCategory,
    uploadProgress,
  } = useSubidaArchivos(warehouses);

  const [fecha, setFecha] = useState(formatDateForInput(new Date()));
  const [hora, setHora] = useState('07:00');

  // DIA_A_DIA es "tiempo real" (k=1): siempre arranca desde el instante actual.
  useEffect(() => {
    if (tipo === 'DIA_A_DIA') {
      const ahora = new Date();
      setFecha(formatDateForInput(ahora));
      setHora(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`);
    } else {
      setHora('07:00');
    }

    if (tipo !== 'DIA_A_DIA') return;

    const actualizarHoraActual = () => {
      const ahora = new Date();
      setFecha(formatDateForInput(ahora));
      setHora(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`);
    };
    const intervalo = window.setInterval(actualizarHoraActual, 60_000);
    return () => window.clearInterval(intervalo);
  }, [tipo]);

  // Si se sube un archivo de pedidos como ventas202609.txt, sugerir/sincronizar el primer día de ese mes
  useEffect(() => {
    if (tipo === 'DIA_A_DIA' || ordersFiles.length === 0) return;
    const primerArchivo = ordersFiles[0];
    const match = primerArchivo.name.match(/(20\d{2})(0[1-9]|1[0-2])/);
    if (match) {
      const year = match[1];
      const month = match[2];
      setFecha(`${year}-${month}-01`);
    }
  }, [ordersFiles, tipo]);

  const esModoPlanificado = tipo === 'CINCO_DIAS' || tipo === 'COLAPSO_LOGISTICO';
  const pedidosFaltantes = ordersFiles.length === 0;
  const bloqueosFaltantes = esModoPlanificado && blockageFiles.length === 0;
  const faltanArchivosObligatorios = pedidosFaltantes || bloqueosFaltantes;

  const fechaFueraDeRango = Boolean(fecha) && (fecha < FECHA_MIN_DATOS || fecha > FECHA_MAX_DATOS);
  const totalArchivosCargados = ordersFiles.length + blockageFiles.length + maintenanceFiles.length;

  const hasActive = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));

  if (hasActive) {
    return <>{children}</>;
  }

  return (
    <div className="absolute inset-0 z-10 flex h-full w-full justify-center overflow-y-auto bg-[var(--color-background)] px-4 py-8 text-[var(--color-text-primary)] animate-in fade-in">
      {verificando ? (
        <div className="my-auto flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span>Verificando ejecución activa...</span>
        </div>
      ) : (
        <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 sm:p-8">
          {/* Cabecera */}
          <div className="text-center pb-6 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              Modo:{' '}
              {tipo === 'DIA_A_DIA'
                ? 'Tiempo Real (Día a Día)'
                : tipo === 'CINCO_DIAS'
                ? 'Simulación 5 Días'
                : 'Colapso Logístico'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100 sm:text-3xl">
              Configuración y Carga de Datos
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              {tipo === 'DIA_A_DIA'
                ? 'Operación en vivo sincronizada con el reloj actual. Sube el archivo de pedidos y ventas para comenzar.'
                : 'Define la fecha y hora de inicio y sube los archivos obligatorios (pedidos y tramos bloqueados) para comenzar la simulación.'}
            </p>
          </div>

          {/* Formulario: Fecha y Hora */}
          <div className="py-6 border-b border-slate-200/80 dark:border-slate-800/80">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
              1. Parámetros de Tiempo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <label htmlFor="fecha-inicio-simulada">Fecha de inicio</label>
                  {tipo !== 'DIA_A_DIA' && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      onClick={() => setFecha(formatDateForInput(new Date()))}
                    >
                      Usar hoy
                    </button>
                  )}
                </div>
                <input
                  id="fecha-inicio-simulada"
                  type="date"
                  value={fecha}
                  min={FECHA_MIN_DATOS}
                  max={FECHA_MAX_DATOS}
                  disabled={tipo === 'DIA_A_DIA'}
                  onChange={(e) => setFecha(e.target.value)}
                  className="scheme-light h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70 dark:scheme-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                  htmlFor="hora-inicio-simulada"
                >
                  Hora de inicio
                </label>
                <input
                  id="hora-inicio-simulada"
                  type="time"
                  value={hora}
                  disabled={tipo === 'DIA_A_DIA'}
                  onChange={(e) => setHora(e.target.value)}
                  className="scheme-light h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70 dark:scheme-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {tipo === 'DIA_A_DIA'
                    ? 'Sincronizado con la hora del sistema'
                    : 'Turno de inicio recomendado: 07:00'}
                </p>
              </div>
            </div>
          </div>

          {/* Sección de Carga de Archivos */}
          <div className="py-6 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  2. Archivos de Entrada
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Los datos cargados se envían y aplican directamente al motor de simulación.
                </p>
              </div>
              {totalArchivosCargados > 0 && (
                <button
                  type="button"
                  onClick={() => void limpiarTodo()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Limpiar archivos</span>
                </button>
              )}
            </div>

            {isUploading && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/90 px-3.5 py-2.5 text-xs font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
                <span>
                  Subiendo y procesando archivos en el servidor
                  {uploadProgress ? ` (${uploadProgress.actual}/${uploadProgress.total})` : ''}...
                </span>
              </div>
            )}

            {uploadEstado && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                  uploadEstado.tipo === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                }`}
              >
                {uploadEstado.tipo === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{uploadEstado.mensaje}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pedidos */}
              <UploadCard
                titulo="Pedidos y Ventas"
                subtitulo="ventasYYYYMM.txt"
                categoria="orders"
                esObligatorio={true}
                archivos={ordersFiles}
                unidadConteo="pedidos"
                extensiones=".txt"
                isUploading={isUploading}
                isUploadingThisCard={uploadingCategory === 'orders'}
                uploadProgress={uploadingCategory === 'orders' ? uploadProgress : null}
                onSubir={procesarArchivos}
                onEliminar={eliminarArchivo}
              />

              {/* Bloqueos */}
              <UploadCard
                titulo="Tramos Bloqueados"
                subtitulo="YYYYMM.bloqueadas"
                categoria="blockages"
                esObligatorio={esModoPlanificado}
                archivos={blockageFiles}
                unidadConteo="bloqueos"
                extensiones=".bloqueadas,.txt"
                isUploading={isUploading}
                isUploadingThisCard={uploadingCategory === 'blockages'}
                uploadProgress={uploadingCategory === 'blockages' ? uploadProgress : null}
                onSubir={procesarArchivos}
                onEliminar={eliminarArchivo}
              />

              {/* Mantenimiento */}
              <UploadCard
                titulo="Mantenimiento"
                subtitulo="mant.preventivo.txt"
                categoria="maintenance"
                esObligatorio={false}
                archivos={maintenanceFiles}
                unidadConteo="registros"
                extensiones=".txt"
                isUploading={isUploading}
                isUploadingThisCard={uploadingCategory === 'maintenance'}
                uploadProgress={uploadingCategory === 'maintenance' ? uploadProgress : null}
                onSubir={procesarArchivos}
                onEliminar={eliminarArchivo}
              />
            </div>
          </div>

          {/* Avisos y Estado */}
          <div className="pt-6 space-y-3">
            {ajustesPendientes.length > 0 && (
              <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                Se aplicarán {ajustesPendientes.length} ajuste(s) de configuración guardados previamente.
              </p>
            )}

            {fechaFueraDeRango && (
              <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                Solo hay datos válidos del curso entre el 01/01/2026 y el 31/12/2028.
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                {(error as Error).message || 'No se pudo iniciar el escenario seleccionado.'}
              </div>
            )}

            {/* Botón de Inicio */}
            <button
              type="button"
              disabled={
                isIniciando ||
                isUploading ||
                fechaFueraDeRango ||
                !fecha ||
                faltanArchivosObligatorios
              }
              onClick={() =>
                iniciarEscenario({
                  tipo,
                  fechaInicioSimulada:
                    tipo === 'DIA_A_DIA'
                      ? new Date().toISOString()
                      : fecha
                      ? `${fecha}T${hora || '00:00'}:00Z`
                      : undefined,
                  ajustesIniciales: ajustesPendientes.length > 0 ? ajustesPendientes : undefined,
                })
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isIniciando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Iniciando simulación...</span>
                </>
              ) : isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando archivos al backend...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>Iniciar Simulación</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
