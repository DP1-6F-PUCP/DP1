import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  FileCode2,
  Package,
  Wrench,
  Trash2,
  ExternalLink,
  RotateCcw,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { BlockedStreet, Order, PreventiveMaintenanceRecord, Warehouse } from '../types';
import {
  parseBlockedStreetsFile,
  parseOrdersFile,
  parseMaintenanceFile,
} from '../utils/fileParser';
import { fileStore, LoadedFileEntry } from '../utils/fileStore';
import { Button } from './ui/Button';

interface SidebarDataFilesProps {
  warehouses: Warehouse[];
  onApplyBlockages?: (blockages: BlockedStreet[], fileNames: string) => void;
  onApplyOrders?: (orders: Order[], fileNames: string) => void;
  onApplyMaintenance?: (records: PreventiveMaintenanceRecord[], summaryText: string) => void;
  onOpenDataFilesModal?: () => void;
  blockedStreetsCount?: number;
  totalOrdersCount?: number;
}

export const SidebarDataFiles: React.FC<SidebarDataFilesProps> = ({
  warehouses,
  onApplyBlockages,
  onApplyOrders,
  onApplyMaintenance,
  onOpenDataFilesModal,
  blockedStreetsCount = 0,
  totalOrdersCount = 0,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'blockages' | 'orders' | 'maintenance'>('blockages');
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // Subscribe to fileStore
  const [, setVersion] = useState(0);
  useEffect(() => {
    return fileStore.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const blockageFiles = fileStore.getBlockageFiles();
  const ordersFiles = fileStore.getOrdersFiles();
  const maintenanceFiles = fileStore.getMaintenanceFiles();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (type: 'success' | 'info' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Upload handler based on current active tab
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      if (activeSubTab === 'blockages') {
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
        fileStore.setBlockageFiles((prev) => {
          const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
          return [...remaining, ...parsedEntries];
        });
        showNotification('success', `${files.length} archivo(s) de bloqueos cargados.`);
      } else if (activeSubTab === 'orders') {
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
        fileStore.setOrdersFiles((prev) => {
          const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
          return [...remaining, ...parsedEntries];
        });
        showNotification('success', `${files.length} archivo(s) de pedidos cargados.`);
      } else {
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
        fileStore.setMaintenanceFiles((prev) => {
          const remaining = prev.filter((p) => !files.some((f) => f.name === p.name));
          return [...remaining, ...parsedEntries];
        });
        showNotification('success', `${files.length} archivo(s) de mantenimiento cargados.`);
      }
    } catch {
      showNotification('error', 'Error al procesar los archivos.');
    }

    if (e.target) e.target.value = '';
  };

  // Actions to apply items to live simulation
  const handleApplyCurrent = () => {
    if (activeSubTab === 'blockages') {
      const allBlockages = blockageFiles.flatMap((f) => f.items);
      const fileNames = blockageFiles.map((f) => f.name).join(', ');
      if (onApplyBlockages) {
        onApplyBlockages(allBlockages, fileNames);
        showNotification('success', `Bloqueos aplicados a la simulación (${allBlockages.length} tramos).`);
      }
    } else if (activeSubTab === 'orders') {
      const allOrders = ordersFiles.flatMap((f) => f.items);
      const fileNames = ordersFiles.map((f) => f.name).join(', ');
      if (onApplyOrders) {
        onApplyOrders(allOrders, fileNames);
        showNotification('success', `Pedidos aplicados a la simulación (${allOrders.length} pedidos).`);
      }
    } else {
      const allMaintenance = maintenanceFiles.flatMap((f) => f.items);
      const summaryText = `${allMaintenance.length} registros`;
      if (onApplyMaintenance) {
        onApplyMaintenance(allMaintenance, summaryText);
        showNotification('success', `Mantenimiento preventivo aplicado.`);
      }
    }
  };

  const handleApplyAll = () => {
    const allBlockages = blockageFiles.flatMap((f) => f.items);
    const blockageNames = blockageFiles.map((f) => f.name).join(', ');
    if (onApplyBlockages) onApplyBlockages(allBlockages, blockageNames);

    const allOrders = ordersFiles.flatMap((f) => f.items);
    const orderNames = ordersFiles.map((f) => f.name).join(', ');
    if (onApplyOrders) onApplyOrders(allOrders, orderNames);

    const allMaintenance = maintenanceFiles.flatMap((f) => f.items);
    if (onApplyMaintenance) onApplyMaintenance(allMaintenance, `${allMaintenance.length} registros`);

    showNotification('success', 'Todos los archivos (bloqueos, pedidos y mantenimiento) han sido aplicados.');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-xs text-slate-100">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={
          activeSubTab === 'blockages'
            ? '.bloqueadas,.txt,.bloqueado'
            : activeSubTab === 'orders'
            ? '.txt,.json'
            : '.txt,.csv'
        }
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* Header Info */}
      <div className="p-3.5 border-b border-white/10 bg-[var(--color-primary)]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-blue-200/80 tracking-wider flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-cyan-300" /> Carga de Archivos
          </span>
          {onOpenDataFilesModal && (
            <button
              type="button"
              onClick={onOpenDataFilesModal}
              className="text-[10px] text-cyan-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              title="Abrir vista completa y detallada"
            >
              <span>Vista modal</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-blue-200/80 mt-1 leading-tight">
          Gestiona los archivos de entrada para la planificación Manhattan (1INF54).
        </p>

        {/* Global overview tags */}
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <div className="p-2 rounded-lg bg-black/20 border border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-blue-200/80">Bloqueos activos</span>
            <span className="font-mono-code font-bold text-cyan-300 text-xs">{blockedStreetsCount}</span>
          </div>
          <div className="p-2 rounded-lg bg-black/20 border border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-blue-200/80">Pedidos activos</span>
            <span className="font-mono-code font-bold text-cyan-300 text-xs">{totalOrdersCount}</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs Selector */}
      <div className="flex border-b border-white/10 bg-black/20 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('blockages')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-center font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
            activeSubTab === 'blockages'
              ? 'bg-[var(--color-secondary)] text-white shadow-sm border border-white/20'
              : 'text-blue-200/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileCode2 className="h-3 w-3" />
          <span>Bloqueos</span>
          <span className="ml-1 text-[9px] px-1 py-0.2 rounded-full bg-black/30 font-mono-code">
            {blockageFiles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('orders')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-center font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
            activeSubTab === 'orders'
              ? 'bg-[var(--color-secondary)] text-white shadow-sm border border-white/20'
              : 'text-blue-200/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Package className="h-3 w-3" />
          <span>Pedidos</span>
          <span className="ml-1 text-[9px] px-1 py-0.2 rounded-full bg-black/30 font-mono-code">
            {ordersFiles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('maintenance')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-center font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
            activeSubTab === 'maintenance'
              ? 'bg-[var(--color-secondary)] text-white shadow-sm border border-white/20'
              : 'text-blue-200/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Wrench className="h-3 w-3" />
          <span>Mant.</span>
          <span className="ml-1 text-[9px] px-1 py-0.2 rounded-full bg-black/30 font-mono-code">
            {maintenanceFiles.length}
          </span>
        </button>
      </div>

      {/* Notifications banner */}
      {notification && (
        <div
          className={`px-3 py-2 text-[11px] flex items-center gap-2 border-b animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/30'
              : notification.type === 'error'
              ? 'bg-rose-950/80 text-rose-200 border-rose-500/30'
              : 'bg-blue-950/80 text-blue-200 border-blue-500/30'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          )}
          <span className="truncate">{notification.message}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Upload Action Card */}
        <div className="p-3 rounded-xl border border-white/15 bg-black/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
              {activeSubTab === 'blockages' && (
                <>
                  <FileCode2 className="h-3.5 w-3.5 text-cyan-300" /> Calles Bloqueadas (*.bloqueadas)
                </>
              )}
              {activeSubTab === 'orders' && (
                <>
                  <Package className="h-3.5 w-3.5 text-cyan-300" /> Plan de Ventas (*.txt / JSON)
                </>
              )}
              {activeSubTab === 'maintenance' && (
                <>
                  <Wrench className="h-3.5 w-3.5 text-cyan-300" /> Mantenimiento Preventivo
                </>
              )}
            </span>
          </div>

          <p className="text-[10px] text-blue-200/70 leading-relaxed">
            {activeSubTab === 'blockages' &&
              'Segmentos cerrados por horas/días con formato ddDhHm-ddDhHm:x1,y1,x2,y2.'}
            {activeSubTab === 'orders' &&
              'Pedidos con timestamp, coordenadas de entrega, cantidad y ventana SLA.'}
            {activeSubTab === 'maintenance' &&
              'Ventanas de 24h fuera de servicio por turno programado de taller.'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-3 rounded-lg border border-cyan-400/40 bg-cyan-500/20 hover:bg-cyan-500/30 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-cyan-300" />
              <span>Subir archivo(s)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                fileStore.resetToSamples(warehouses);
                showNotification('info', 'Archivos de muestra cargados en memoria.');
              }}
              className="py-2 px-2.5 rounded-lg border border-white/15 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Restablecer archivos de muestra oficiales"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Loaded Files List */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] uppercase font-bold text-blue-200/80">Archivos cargados en memoria</span>
            <span className="text-[9px] font-mono-code text-blue-200/60">
              {activeSubTab === 'blockages' && `${blockageFiles.length} archivo(s)`}
              {activeSubTab === 'orders' && `${ordersFiles.length} archivo(s)`}
              {activeSubTab === 'maintenance' && `${maintenanceFiles.length} archivo(s)`}
            </span>
          </div>

          {activeSubTab === 'blockages' && (
            <div className="space-y-1.5">
              {blockageFiles.length === 0 ? (
                <div className="p-3 text-center rounded-lg border border-white/10 bg-black/20 text-blue-200/60 italic text-[11px]">
                  No hay archivos de bloqueos cargados
                </div>
              ) : (
                blockageFiles.map((f) => (
                  <div
                    key={f.name}
                    className="p-2.5 rounded-lg border border-white/10 bg-black/20 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-cyan-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate text-[11px]">{f.name}</div>
                        <div className="text-[9px] text-blue-200/70 font-mono-code">
                          {f.count} segmentos bloqueados
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        fileStore.setBlockageFiles((prev) => prev.filter((item) => item.name !== f.name))
                      }
                      className="p-1 rounded text-blue-200/50 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                      title="Eliminar archivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeSubTab === 'orders' && (
            <div className="space-y-1.5">
              {ordersFiles.length === 0 ? (
                <div className="p-3 text-center rounded-lg border border-white/10 bg-black/20 text-blue-200/60 italic text-[11px]">
                  No hay archivos de pedidos cargados
                </div>
              ) : (
                ordersFiles.map((f) => (
                  <div
                    key={f.name}
                    className="p-2.5 rounded-lg border border-white/10 bg-black/20 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-cyan-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate text-[11px]">{f.name}</div>
                        <div className="text-[9px] text-blue-200/70 font-mono-code">
                          {f.count} pedidos validados
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        fileStore.setOrdersFiles((prev) => prev.filter((item) => item.name !== f.name))
                      }
                      className="p-1 rounded text-blue-200/50 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                      title="Eliminar archivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeSubTab === 'maintenance' && (
            <div className="space-y-1.5">
              {maintenanceFiles.length === 0 ? (
                <div className="p-3 text-center rounded-lg border border-white/10 bg-black/20 text-blue-200/60 italic text-[11px]">
                  No hay archivos de mantenimiento cargados
                </div>
              ) : (
                maintenanceFiles.map((f) => (
                  <div
                    key={f.name}
                    className="p-2.5 rounded-lg border border-white/10 bg-black/20 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Wrench className="h-4 w-4 text-cyan-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate text-[11px]">{f.name}</div>
                        <div className="text-[9px] text-blue-200/70 font-mono-code">
                          {f.count} registros de mantenimiento
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        fileStore.setMaintenanceFiles((prev) => prev.filter((item) => item.name !== f.name))
                      }
                      className="p-1 rounded text-blue-200/50 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                      title="Eliminar archivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="p-3 border-t border-white/10 bg-[var(--color-primary)] space-y-2">
        <Button
          id="btn-apply-sidebar-files"
          variant="primary"
          size="sm"
          onClick={handleApplyCurrent}
          className="w-full justify-center text-white bg-[var(--color-secondary)] hover:opacity-90 font-semibold shadow-md py-2 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          <span>
            {activeSubTab === 'blockages' && 'Aplicar Bloqueos a la Simulación'}
            {activeSubTab === 'orders' && 'Aplicar Pedidos a la Simulación'}
            {activeSubTab === 'maintenance' && 'Aplicar Mantenimiento a la Simulación'}
          </span>
        </Button>

        <button
          type="button"
          onClick={handleApplyAll}
          className="w-full text-center py-1.5 text-[10px] text-cyan-300 hover:text-white transition-colors underline cursor-pointer"
        >
          Aplicar todos los tipos a la vez
        </button>
      </div>
    </div>
  );
};
