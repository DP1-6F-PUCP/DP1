import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Upload, CheckCircle2, X, FileCode2, Package, Layers, Wrench, Trash2, Files, Loader2, AlertCircle } from 'lucide-react';
import { Warehouse } from '../types';
import { useSubidaArchivos, CategoriaArchivo } from '../features/archivos/hooks/useSubidaArchivos';

interface DataFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Warehouse[];
  isDarkTheme?: boolean;
}

const TABS: { id: CategoriaArchivo; label: string; icon: typeof Layers; accept: string; vacio: string }[] = [
  { id: 'blockages', label: '1. Calles Bloqueadas', icon: Layers, accept: '.bloqueadas,.txt', vacio: 'No hay archivos de calles bloqueadas subidos.' },
  { id: 'orders', label: '2. Histórico de Pedidos', icon: Package, accept: '.txt', vacio: 'No hay archivos de pedidos subidos.' },
  { id: 'maintenance', label: '3. Mantenimiento Preventivo', icon: Wrench, accept: '.txt,.csv', vacio: 'No hay archivos de mantenimiento subidos.' },
];

/**
 * Usa useSubidaArchivos (ver fileStore.leerYParsearArchivos) -- antes cada uno de los 3 tabs de
 * este componente reimplementaba su propio FileReader+parse+dedupe. Subir un archivo aqui YA lo
 * aplica en el backend (POST /api/files/*) -- no hay un boton "Aplicar" aparte, porque el
 * servidor no tiene ese paso separado.
 */
export const DataFilesModal: React.FC<DataFilesModalProps> = ({ isOpen, onClose, warehouses, isDarkTheme = true }) => {
  const [activeTab, setActiveTab] = useState<CategoriaArchivo>('blockages');
  const { blockageFiles, ordersFiles, maintenanceFiles, procesarArchivos, eliminarArchivo, estado, isUploading } =
    useSubidaArchivos(warehouses);

  if (!isOpen) return null;

  // Solo se usan file.name/file.count mas abajo (comunes a los 3 LoadedFileEntry<T>, con T
  // distinto por pestana) -- tipar como "typeof blockageFiles" para las 3 claves era incorrecto
  // (cada array tiene un T distinto), aunque en runtime no fallara por la erasura de tipos de JS.
  const filesPorTab: Record<CategoriaArchivo, { name: string; count: number }[]> = {
    blockages: blockageFiles,
    orders: ordersFiles,
    maintenance: maintenanceFiles,
  };
  const tabActiva = TABS.find((t) => t.id === activeTab)!;
  const archivosActivos = filesPorTab[activeTab];

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await procesarArchivos(activeTab, files);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl p-6 transition-all max-h-[90vh] flex flex-col ${
          isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)]'
        }`}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4 shrink-0 border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isDarkTheme ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-blue-50 border-blue-200 text-[var(--color-primary)]'}`}>
              <FileCode2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">Ingreso de Archivos de Datos</h2>
              <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-[var(--color-text-secondary)]'}`}>
                Sube los archivos oficiales directamente al backend (se aplican al recibirlos)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ingreso de archivos"
            className={`p-1.5 rounded-lg border transition-colors ${
              isDarkTheme ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 hover:bg-slate-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {estado && (
          <div
            className={`mb-3 p-2.5 rounded-xl border text-xs flex items-center gap-2 shrink-0 ${
              estado.tipo === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : estado.tipo === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}
          >
            {estado.tipo === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{estado.mensaje}</span>
          </div>
        )}

        <div className="flex gap-2 border-b pb-3 mb-4 shrink-0 border-slate-700/50">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-all ${
                activeTab !== id
                  ? isDarkTheme
                    ? 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'shadow-md'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          <div className="flex items-center justify-end gap-2">
            <label
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs border transition-colors shadow-sm ${
                isUploading ? 'opacity-50 pointer-events-none' : ''
              } bg-blue-600 hover:bg-blue-500 text-white border-blue-500`}
            >
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span>{isUploading ? 'Subiendo...' : 'Subir y aplicar archivos'}</span>
              <input type="file" multiple accept={tabActiva.accept} onChange={handleFilesChange} className="hidden" disabled={isUploading} />
            </label>

            {archivosActivos.length > 0 && (
              <button
                type="button"
                onClick={() => archivosActivos.forEach((f) => eliminarArchivo(activeTab, f.name))}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  isDarkTheme ? 'border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 hover:text-white' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
                title="Quitar de la vista (no revierte lo ya subido al backend)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Quitar todos de la vista</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span className="flex items-center gap-1">
                <Files className="h-3.5 w-3.5 text-blue-400" />
                Archivos subidos ({archivosActivos.length})
              </span>
            </div>

            {archivosActivos.length === 0 ? (
              <div className={`p-6 text-center rounded-xl border border-dashed text-xs ${isDarkTheme ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>
                {tabActiva.vacio}
              </div>
            ) : (
              <div className={`divide-y rounded-xl border max-h-56 overflow-y-auto ${isDarkTheme ? 'bg-slate-950 border-slate-800 divide-slate-800/60' : 'bg-slate-50 border-slate-200 divide-slate-200'}`}>
                {archivosActivos.map((file) => (
                  <div key={file.name} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-code font-bold text-blue-400">{file.name}</span>
                      <span className="text-[10px] text-slate-500">({file.count} registros)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarArchivo(activeTab, file.name)}
                      aria-label={`Quitar archivo ${file.name} de la vista`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Quitar de la vista (no revierte lo ya subido al backend)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end border-t pt-4 mt-4 shrink-0 border-slate-700/50">
          <Button variant="secondary" onClick={onClose} className={isDarkTheme ? 'btn-secondary-on-dark' : ''}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
};
