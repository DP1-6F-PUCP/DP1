import { useEffect, useState } from 'react';
import { fileStore, leerYParsearArchivos } from '../../../utils/fileStore';
import { parseBlockedStreetsFile, parseOrdersFile, parseMaintenanceFile } from '../../../utils/fileParser';
import { archivosApi } from '../../../services/archivosApi';
import { Warehouse } from '../../../types';

export type CategoriaArchivo = 'blockages' | 'orders' | 'maintenance';

export interface EstadoSubida {
  tipo: 'success' | 'error' | 'info';
  mensaje: string;
}

/**
 * Unico punto de subida de archivos, usado por DataFilesModal -- antes dos componentes distintos
 * (DataFilesModal y el ya borrado SidebarDataFiles) reimplementaban por su cuenta, 3 veces cada
 * uno, el mismo FileReader+parse+dedupe (6 copias en total, confirmado en la revision de
 * codigo). Tambien antes NINGUNO llegaba al backend real
 * (POST /api/files/*, que existia desde la Fase A sin que nada lo llamara): el parseo local era
 * solo para previsualizar (conteo, nombre, contenido), la subida real es la que de verdad aplica
 * el archivo -- el backend no tiene un paso separado de "aplicar", aplica al recibirlo.
 */
export function useSubidaArchivos(warehouses: Warehouse[]) {
  const [, forceUpdate] = useState(0);
  useEffect(() => fileStore.subscribe(() => forceUpdate((v) => v + 1)), []);

  const [estado, setEstado] = useState<EstadoSubida | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<CategoriaArchivo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ actual: number; total: number } | null>(null);

  const mostrarEstado = (estadoNuevo: EstadoSubida) => {
    setEstado(estadoNuevo);
    setTimeout(() => setEstado(null), 3500);
  };

  const subirPorLotes = async <T,>(items: File[], fn: (f: File) => Promise<T>, tamanoLote = 4) => {
    let completados = 0;
    for (let i = 0; i < items.length; i += tamanoLote) {
      const lote = items.slice(i, i + tamanoLote);
      await Promise.all(
        lote.map(async (f) => {
          const res = await fn(f);
          completados += 1;
          setUploadProgress({ actual: completados, total: items.length });
          return res;
        })
      );
    }
  };

  const procesarArchivos = async (categoria: CategoriaArchivo, files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadingCategory(categoria);
    setUploadProgress({ actual: 0, total: files.length });
    // Ceder un frame para que React renderice el spinner antes del parseo masivo
    await new Promise((resolve) => setTimeout(resolve, 16));
    try {
      const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
      if (categoria === 'blockages') {
        const entries = await leerYParsearArchivos(sortedFiles, (c, n) => parseBlockedStreetsFile(c, n).blockages);
        await subirPorLotes(sortedFiles, (f) => archivosApi.cargarBloqueos(f));
        fileStore.setBlockageFiles((prev) =>
          [...prev.filter((p) => !sortedFiles.some((f) => f.name === p.name)), ...entries].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      } else if (categoria === 'orders') {
        const entries = await leerYParsearArchivos(sortedFiles, (c, n) => parseOrdersFile(c, n, warehouses).orders);
        await subirPorLotes(sortedFiles, (f) => archivosApi.cargarPedidos(f));
        fileStore.setOrdersFiles((prev) =>
          [...prev.filter((p) => !sortedFiles.some((f) => f.name === p.name)), ...entries].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      } else {
        const entries = await leerYParsearArchivos(sortedFiles, (c, n) => parseMaintenanceFile(c, n).records);
        await subirPorLotes(sortedFiles, (f) => archivosApi.cargarMantenimiento(f));
        fileStore.setMaintenanceFiles((prev) =>
          [...prev.filter((p) => !sortedFiles.some((f) => f.name === p.name)), ...entries].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
      mostrarEstado({ tipo: 'success', mensaje: `${files.length} archivo(s) subido(s) y aplicado(s) en el backend.` });
    } catch (err) {
      mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'Error al procesar los archivos.' });
    } finally {
      setIsUploading(false);
      setUploadingCategory(null);
      setUploadProgress(null);
    }
  };

  const eliminarArchivo = (categoria: CategoriaArchivo, nombre: string) => {
    if (categoria === 'blockages') {
      fileStore.setBlockageFiles((prev) => prev.filter((f) => f.name !== nombre));
    } else if (categoria === 'orders') {
      fileStore.setOrdersFiles((prev) => prev.filter((f) => f.name !== nombre));
    } else {
      fileStore.setMaintenanceFiles((prev) => prev.filter((f) => f.name !== nombre));
    }
  };

  return {
    blockageFiles: fileStore.getBlockageFiles(),
    ordersFiles: fileStore.getOrdersFiles(),
    maintenanceFiles: fileStore.getMaintenanceFiles(),
    procesarArchivos,
    eliminarArchivo,
    resetToSamples: () => fileStore.resetToSamples(warehouses),
    limpiarTodo: async () => {
      fileStore.clearAll();
      try {
        await archivosApi.limpiarArchivos();
      } catch {
        // backend opcional o en reinicio
      }
    },
    estado,
    isUploading,
    uploadingCategory,
    uploadProgress,
  };
}
