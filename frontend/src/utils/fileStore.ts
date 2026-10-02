import { BlockedStreet, Order, PreventiveMaintenanceRecord, Warehouse } from '../types';
import { INITIAL_WAREHOUSES } from './manhattan';
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

let blockageFiles: LoadedFileEntry<BlockedStreet>[] = [
  {
    name: '202609.bloqueadas',
    content: SAMPLE_BLOCKAGES_FILE_CONTENT,
    count: parseBlockedStreetsFile(SAMPLE_BLOCKAGES_FILE_CONTENT, '202609.bloqueadas').blockages.length,
    items: parseBlockedStreetsFile(SAMPLE_BLOCKAGES_FILE_CONTENT, '202609.bloqueadas').blockages,
  },
];

let ordersFiles: LoadedFileEntry<Order>[] = [
  {
    name: 'ventas202609',
    content: SAMPLE_ORDERS_FILE_CONTENT,
    count: parseOrdersFile(SAMPLE_ORDERS_FILE_CONTENT, 'ventas202609', INITIAL_WAREHOUSES).orders.length,
    items: parseOrdersFile(SAMPLE_ORDERS_FILE_CONTENT, 'ventas202609', INITIAL_WAREHOUSES).orders,
  },
];

let maintenanceFiles: LoadedFileEntry<PreventiveMaintenanceRecord>[] = [
  {
    name: 'mant.preventivo.09.10',
    content: SAMPLE_MAINTENANCE_FILE_CONTENT,
    count: parseMaintenanceFile(SAMPLE_MAINTENANCE_FILE_CONTENT, 'mant.preventivo.09.10').records.length,
    items: parseMaintenanceFile(SAMPLE_MAINTENANCE_FILE_CONTENT, 'mant.preventivo.09.10').records,
  },
];

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

  resetToSamples(warehouses: Warehouse[] = INITIAL_WAREHOUSES) {
    const effectiveWarehouses = warehouses && warehouses.length > 0 ? warehouses : INITIAL_WAREHOUSES;
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
