import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import {
  Upload,
  CheckCircle2,
  X,
  FileCode2,
  Package,
  Layers,
  Wrench,
  Trash2,
  Files,
} from 'lucide-react';
import {
  BlockedStreet,
  Order,
  Warehouse,
  PreventiveMaintenanceRecord,
} from '../types';
import {
  parseBlockedStreetsFile,
  parseOrdersFile,
  parseMaintenanceFile,
  SAMPLE_BLOCKAGES_FILE_CONTENT,
  SAMPLE_ORDERS_FILE_CONTENT,
  SAMPLE_MAINTENANCE_FILE_CONTENT,
} from '../utils/fileParser';

import { fileStore, LoadedFileEntry } from '../utils/fileStore';

interface DataFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyBlockages: (blockages: BlockedStreet[], fileNames: string) => void;
  onApplyOrders: (orders: Order[], fileNames: string) => void;
  onApplyMaintenance?: (records: PreventiveMaintenanceRecord[], summaryText: string) => void;
  warehouses: Warehouse[];
  currentBlockedCount?: number;
  currentOrdersCount?: number;
  isDarkTheme?: boolean;
}

export const DataFilesModal: React.FC<DataFilesModalProps> = ({
  isOpen,
  onClose,
  onApplyBlockages,
  onApplyOrders,
  onApplyMaintenance,
  warehouses,
  isDarkTheme = true,
}) => {
  const [activeTab, setActiveTab] = useState<'blockages' | 'orders' | 'maintenance'>('blockages');

  const [, setVersion] = useState(0);
  useEffect(() => {
    return fileStore.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const loadedBlockageFiles = fileStore.getBlockageFiles();
  const setLoadedBlockageFiles = fileStore.setBlockageFiles;

  const loadedOrdersFiles = fileStore.getOrdersFiles();
  const setLoadedOrdersFiles = fileStore.setOrdersFiles;

  const loadedMaintenanceFiles = fileStore.getMaintenanceFiles();
  const setLoadedMaintenanceFiles = fileStore.setMaintenanceFiles;

  const [notification, setNotification] = useState<string | null>(null);

  if (!isOpen) return null;

  // Flattened active items
  const allBlockages = loadedBlockageFiles.flatMap((f) => f.items);
  const allOrders = loadedOrdersFiles.flatMap((f) => f.items);
  const allMaintenance = loadedMaintenanceFiles.flatMap((f) => f.items);

  // Multi-file upload handlers (without count in toast notifications)
  const handleBlockageFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const parsedEntries = await Promise.all(
      files.map(
        (file) =>
          new Promise<LoadedFileEntry<BlockedStreet>>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const text = (event.target?.result as string) || '';
              const parsed = parseBlockedStreetsFile(text, file.name);
              resolve({
                name: file.name,
                content: text,
                count: parsed.blockages.length,
                items: parsed.blockages,
              });
            };
            reader.readAsText(file);
          })
      )
    );

    setLoadedBlockageFiles((prev) => {
      const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
      return [...remaining, ...parsedEntries];
    });

    setNotification(`Cargados ${files.length} archivo(s) de calles bloqueadas en memoria.`);
    setTimeout(() => setNotification(null), 4000);
    e.target.value = '';
  };

  const handleOrdersFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const parsedEntries = await Promise.all(
      files.map(
        (file) =>
          new Promise<LoadedFileEntry<Order>>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const text = (event.target?.result as string) || '';
              const parsed = parseOrdersFile(text, file.name, warehouses);
              resolve({
                name: file.name,
                content: text,
                count: parsed.orders.length,
                items: parsed.orders,
              });
            };
            reader.readAsText(file);
          })
      )
    );

    setLoadedOrdersFiles((prev) => {
      const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
      return [...remaining, ...parsedEntries];
    });

    setNotification(`Cargados ${files.length} archivo(s) de pedidos en memoria.`);
    setTimeout(() => setNotification(null), 4000);
    e.target.value = '';
  };

  const handleMaintenanceFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const parsedEntries = await Promise.all(
      files.map(
        (file) =>
          new Promise<LoadedFileEntry<PreventiveMaintenanceRecord>>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const text = (event.target?.result as string) || '';
              const parsed = parseMaintenanceFile(text, file.name);
              resolve({
                name: file.name,
                content: text,
                count: parsed.records.length,
                items: parsed.records,
              });
            };
            reader.readAsText(file);
          })
      )
    );

    setLoadedMaintenanceFiles((prev) => {
      const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
      return [...remaining, ...parsedEntries];
    });

    setNotification(`Cargados ${files.length} archivo(s) de mantenimiento en memoria.`);
    setTimeout(() => setNotification(null), 4000);
    e.target.value = '';
  };

  // Remove individual file from list
  const handleRemoveBlockageFile = (fileName: string) => {
    setLoadedBlockageFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleRemoveOrdersFile = (fileName: string) => {
    setLoadedOrdersFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleRemoveMaintenanceFile = (fileName: string) => {
    setLoadedMaintenanceFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  // Clear all files in memory handlers
  const handleClearAllBlockages = () => {
    setLoadedBlockageFiles([]);
    setNotification('Se han eliminado todos los archivos de bloqueos en memoria.');
    setTimeout(() => setNotification(null), 3500);
  };

  const handleClearAllOrders = () => {
    setLoadedOrdersFiles([]);
    setNotification('Se han eliminado todos los archivos de pedidos en memoria.');
    setTimeout(() => setNotification(null), 3500);
  };

  const handleClearAllMaintenance = () => {
    setLoadedMaintenanceFiles([]);
    setNotification('Se han eliminado todos los archivos de mantenimiento en memoria.');
    setTimeout(() => setNotification(null), 3500);
  };

  // Apply ALL changes handler: applies all loaded files and updates from all categories to the simulation
  const handleApplyAllChanges = () => {
    // 1. Bloqueos
    const blockageSummary = loadedBlockageFiles.map((f) => f.name).join(', ') || 'Sin archivos';
    onApplyBlockages(allBlockages, blockageSummary);

    // 2. Pedidos
    const ordersSummary = loadedOrdersFiles.map((f) => f.name).join(', ') || 'Sin archivos';
    onApplyOrders(allOrders, ordersSummary);

    // 3. Mantenimiento Preventivo
    if (onApplyMaintenance) {
      const maintenanceSummary =
        loadedMaintenanceFiles.length > 0
          ? `${loadedMaintenanceFiles.length} archivos bimestrales procesados.`
          : 'Sin mantenimientos programados.';
      onApplyMaintenance(allMaintenance, maintenanceSummary);
    }

    setNotification('Todos los cambios de los archivos cargados se han aplicado a la simulación.');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl p-6 transition-all max-h-[90vh] flex flex-col ${
          isDarkTheme
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 shrink-0 border-slate-700/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isDarkTheme
                  ? 'bg-slate-800 border-slate-700 text-blue-400'
                  : 'bg-blue-50 border-blue-200 text-[var(--color-primary)]'
              }`}
            >
              <FileCode2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Ingreso de Archivos de Datos
              </h2>
              <p
                className={`text-xs ${
                  isDarkTheme ? 'text-slate-400' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                Carga y gestión de archivos de bloqueos, pedidos y mantenimiento preventivo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ingreso de archivos"
            className={`p-1.5 rounded-lg border transition-colors ${
              isDarkTheme
                ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notification banner */}
        {notification && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 shrink-0">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Tab selection */}
        <div className="flex gap-2 border-b pb-3 mb-4 shrink-0 border-slate-700/50">
          <button
            type="button"
            onClick={() => setActiveTab('blockages')}
            aria-pressed={activeTab === 'blockages'}
            className={`control-pressed flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              activeTab !== 'blockages'
                ? isDarkTheme
                ? 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'shadow-md'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>1. Calles Bloqueadas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            aria-pressed={activeTab === 'orders'}
            className={`control-pressed flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              activeTab !== 'orders'
                ? isDarkTheme
                ? 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'shadow-md'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>2. Histórico de Pedidos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            aria-pressed={activeTab === 'maintenance'}
            className={`control-pressed flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              activeTab !== 'maintenance'
                ? isDarkTheme
                ? 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'shadow-md'
            }`}
          >
            <Wrench className="h-4 w-4" />
            <span>3. Mantenimiento Preventivo</span>
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* TAB 1: CALLES BLOQUEADAS */}
          {activeTab === 'blockages' && (
            <div className="space-y-4">
              {/* Controls: Seleccionar archivos y Eliminar todos - Alineados a la derecha */}
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center justify-end gap-2">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs border transition-colors shadow-sm ${
                      isDarkTheme
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Seleccionar archivos</span>
                    <input
                      type="file"
                      multiple
                      accept=".bloqueadas,.txt,.csv,*"
                      onChange={handleBlockageFilesChange}
                      className="hidden"
                    />
                  </label>

                  {loadedBlockageFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllBlockages}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 hover:text-white'
                          : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                      title="Eliminar todos los archivos de bloqueos de la memoria"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Eliminar todos los archivos en memoria</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Loaded Files List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Files className="h-3.5 w-3.5 text-blue-400" />
                    Archivos cargados en memoria ({loadedBlockageFiles.length})
                  </span>
                </div>

                {loadedBlockageFiles.length === 0 ? (
                  <div
                    className={`p-6 text-center rounded-xl border border-dashed text-xs ${
                      isDarkTheme
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-300 text-slate-500'
                    }`}
                  >
                    No hay archivos de calles bloqueadas cargados en memoria.
                  </div>
                ) : (
                  <div
                    className={`divide-y rounded-xl border max-h-56 overflow-y-auto ${
                      isDarkTheme
                        ? 'bg-slate-950 border-slate-800 divide-slate-800/60'
                        : 'bg-slate-50 border-slate-200 divide-slate-200'
                    }`}
                  >
                    {loadedBlockageFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-code font-bold text-blue-400">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveBlockageFile(file.name)}
                            aria-label={`Quitar archivo ${file.name} de la memoria`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Quitar este archivo de la memoria"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HISTÓRICO DE PEDIDOS */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {/* Controls: Seleccionar archivos y Eliminar todos - Alineados a la derecha */}
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center justify-end gap-2">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs border transition-colors shadow-sm ${
                      isDarkTheme
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Seleccionar archivos</span>
                    <input
                      type="file"
                      multiple
                      accept=".txt,.csv,*"
                      onChange={handleOrdersFilesChange}
                      className="hidden"
                    />
                  </label>

                  {loadedOrdersFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllOrders}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 hover:text-white'
                          : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                      title="Eliminar todos los archivos de pedidos de la memoria"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Eliminar todos los archivos en memoria</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Loaded Files List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Files className="h-3.5 w-3.5 text-blue-400" />
                    Archivos cargados en memoria ({loadedOrdersFiles.length})
                  </span>
                </div>

                {loadedOrdersFiles.length === 0 ? (
                  <div
                    className={`p-6 text-center rounded-xl border border-dashed text-xs ${
                      isDarkTheme
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-300 text-slate-500'
                    }`}
                  >
                    No hay archivos de pedidos cargados en memoria.
                  </div>
                ) : (
                  <div
                    className={`divide-y rounded-xl border max-h-56 overflow-y-auto ${
                      isDarkTheme
                        ? 'bg-slate-950 border-slate-800 divide-slate-800/60'
                        : 'bg-slate-50 border-slate-200 divide-slate-200'
                    }`}
                  >
                    {loadedOrdersFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-code font-bold text-blue-400">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveOrdersFile(file.name)}
                            aria-label={`Quitar archivo ${file.name} de la memoria`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Quitar este archivo de la memoria"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MANTENIMIENTO PREVENTIVO */}
          {activeTab === 'maintenance' && (
            <div className="space-y-4">
              {/* Controls: Seleccionar archivos y Eliminar todos - Alineados a la derecha */}
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center justify-end gap-2">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs border transition-colors shadow-sm ${
                      isDarkTheme
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Seleccionar archivos</span>
                    <input
                      type="file"
                      multiple
                      accept=".txt,.csv,*"
                      onChange={handleMaintenanceFilesChange}
                      className="hidden"
                    />
                  </label>

                  {loadedMaintenanceFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllMaintenance}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 hover:text-white'
                          : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                      title="Eliminar todos los archivos de mantenimiento de la memoria"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Eliminar todos los archivos en memoria</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Loaded Files List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Files className="h-3.5 w-3.5 text-blue-400" />
                    Archivos en memoria ({loadedMaintenanceFiles.length})
                  </span>
                </div>

                {loadedMaintenanceFiles.length === 0 ? (
                  <div
                    className={`p-6 text-center rounded-xl border border-dashed text-xs ${
                      isDarkTheme
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-300 text-slate-500'
                    }`}
                  >
                    No hay archivos de mantenimiento cargados en memoria.
                  </div>
                ) : (
                  <div
                    className={`divide-y rounded-xl border max-h-56 overflow-y-auto ${
                      isDarkTheme
                        ? 'bg-slate-950 border-slate-800 divide-slate-800/60'
                        : 'bg-slate-50 border-slate-200 divide-slate-200'
                    }`}
                  >
                    {loadedMaintenanceFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-code font-bold text-blue-400">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveMaintenanceFile(file.name)}
                            aria-label={`Quitar archivo ${file.name} de la memoria`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Quitar este archivo de la memoria"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t pt-4 mt-4 shrink-0 border-slate-700/50">
          <div className="text-[11px] text-slate-400">
            Los archivos cargados en cada sección se mantendrán y aplicarán en conjunto a la simulación.
          </div>

          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              onClick={onClose}
              className={isDarkTheme ? 'btn-secondary-on-dark' : ''}
            >
              Cerrar
            </Button>
            <Button
              id="btn-apply-data-files"
              variant="primary"
              onClick={handleApplyAllChanges}
              title="Aplica todos los cambios y archivos cargados (bloqueos, pedidos y mantenimientos) a la simulación activa"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              <span>Aplicar todos los cambios a la simulación</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
