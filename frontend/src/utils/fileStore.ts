import { BlockedStreet, Order, PreventiveMaintenanceRecord, Warehouse } from '../types';
import {
  parseBlockedStreetsFile,
  parseOrdersFile,
  parseMaintenanceFile,
  SAMPLE_BLOCKAGES_FILE_CONTENT,
  SAMPLE_ORDERS_FILE_CONTENT,
  SAMPLE_MAINTENANCE_FILE_CONTENT,
} from './fileParser';

export interface LoadedFileEntry<T> {
  name: string;
  content: string;
  count: number;
  items: T[];
}

/**
 * Lee+parsea un lote de archivos UNA sola vez (antes esta misma logica de FileReader estaba
 * copiada 3 veces dentro de DataFilesModal y 3 veces mas dentro del ya borrado SidebarDataFiles,
 * sin reader.onerror -- si un archivo fallaba al leerse, su Promise nunca resolvia ni rechazaba
 * y Promise.all se colgaba para siempre, confirmado en la revision de codigo). Aqui se corrige
 * una sola vez.
 */
export function leerYParsearArchivos<T>(
  files: File[],
  parseFn: (contenido: string, nombreArchivo: string) => T[]
): Promise<LoadedFileEntry<T>[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<LoadedFileEntry<T>>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const texto = (event.target?.result as string) || '';
            const items = parseFn(texto, file.name);
            resolve({ name: file.name, content: texto, count: items.length, items });
          };
          reader.onerror = () => reject(new Error(`No se pudo leer el archivo ${file.name}`));
          reader.readAsText(file);
        })
    )
  );
}

// Antes precargaba datos de muestra al iniciar el modulo (hardcode "para que corra" -- el
// usuario veia un archivo ya cargado sin haber subido nada). Ahora arranca vacio; cargar la
// muestra es una accion explicita (resetToSamples), no un estado inicial oculto.
let blockageFiles: LoadedFileEntry<BlockedStreet>[] = [];
let ordersFiles: LoadedFileEntry<Order>[] = [];
let maintenanceFiles: LoadedFileEntry<PreventiveMaintenanceRecord>[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export const fileStore = {
  getBlockageFiles(): LoadedFileEntry<BlockedStreet>[] {
    return blockageFiles;
  },
  setBlockageFiles(files: LoadedFileEntry<BlockedStreet>[] | ((prev: LoadedFileEntry<BlockedStreet>[]) => LoadedFileEntry<BlockedStreet>[])) {
    blockageFiles = typeof files === 'function' ? files(blockageFiles) : files;
    notify();
  },

  getOrdersFiles(): LoadedFileEntry<Order>[] {
    return ordersFiles;
  },
  setOrdersFiles(files: LoadedFileEntry<Order>[] | ((prev: LoadedFileEntry<Order>[]) => LoadedFileEntry<Order>[])) {
    ordersFiles = typeof files === 'function' ? files(ordersFiles) : files;
    notify();
  },

  getMaintenanceFiles(): LoadedFileEntry<PreventiveMaintenanceRecord>[] {
    return maintenanceFiles;
  },
  setMaintenanceFiles(files: LoadedFileEntry<PreventiveMaintenanceRecord>[] | ((prev: LoadedFileEntry<PreventiveMaintenanceRecord>[]) => LoadedFileEntry<PreventiveMaintenanceRecord>[])) {
    maintenanceFiles = typeof files === 'function' ? files(maintenanceFiles) : files;
    notify();
  },

  getAllBlockages(): BlockedStreet[] {
    return blockageFiles.flatMap((f) => f.items || []);
  },

  getAllOrders(): Order[] {
    return ordersFiles.flatMap((f) => f.items || []);
  },

  getAllMaintenance(): PreventiveMaintenanceRecord[] {
    return maintenanceFiles.flatMap((f) => f.items || []);
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  resetToSamples(warehouses: Warehouse[] = []) {
    const effectiveWarehouses = warehouses && warehouses.length > 0 ? warehouses : [];
    const parsedBlockages = parseBlockedStreetsFile(SAMPLE_BLOCKAGES_FILE_CONTENT, '202609.bloqueadas');
    const parsedOrders = parseOrdersFile(SAMPLE_ORDERS_FILE_CONTENT, 'ventas202609', effectiveWarehouses);
    const parsedMaint = parseMaintenanceFile(SAMPLE_MAINTENANCE_FILE_CONTENT, 'mant.preventivo.09.10');

    blockageFiles = [
      {
        name: '202609.bloqueadas',
        content: SAMPLE_BLOCKAGES_FILE_CONTENT,
        count: parsedBlockages.blockages.length,
        items: parsedBlockages.blockages,
      },
    ];
    ordersFiles = [
      {
        name: 'ventas202609',
        content: SAMPLE_ORDERS_FILE_CONTENT,
        count: parsedOrders.orders.length,
        items: parsedOrders.orders,
      },
    ];
    maintenanceFiles = [
      {
        name: 'mant.preventivo.09.10',
        content: SAMPLE_MAINTENANCE_FILE_CONTENT,
        count: parsedMaint.records.length,
        items: parsedMaint.records,
      },
    ];
    notify();
  },
};
