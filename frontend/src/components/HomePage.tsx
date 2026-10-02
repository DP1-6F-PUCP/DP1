import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
} from 'lucide-react';
import {
  BlockedStreet,
  Order,
  PreventiveMaintenanceRecord,
  ScenarioType,
  SimulationState,
  Warehouse,
  Vehicle,
} from '../types';
import {
  parseBlockedStreetsFile,
  parseOrdersFile,
  parseMaintenanceFile,
} from '../utils/fileParser';
import { fileStore } from '../utils/fileStore';

interface HomePageProps {
  scenario: ScenarioType;
  onSelectScenario: (scenario: ScenarioType) => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  orders: Order[];
  blockedStreets: BlockedStreet[];
  maintenanceRecords: PreventiveMaintenanceRecord[];
  onApplyBlockages: (blockages: BlockedStreet[], fileNames: string) => void;
  onApplyOrders: (orders: Order[], fileNames: string) => void;
  onApplyMaintenance: (records: PreventiveMaintenanceRecord[], summaryText: string) => void;
  onStartSimulation?: () => void;
  simState: SimulationState;
  isDarkTheme?: boolean;
}

export const HomePage: React.FC<HomePageProps> = ({
  warehouses,
  onApplyBlockages,
  onApplyOrders,
  onApplyMaintenance,
}) => {
  // File names state adapted to the user's GLP Logistics project (1INF54)
  const [blockagesFileName, setBlockagesFileName] = useState<string>(
    '202609.bloqueadas'
  );
  const [ordersFileName, setOrdersFileName] = useState<string>(
    'ventas202609.txt'
  );
  const [maintenanceFileName, setMaintenanceFileName] = useState<string>(
    'mant.preventivo.09.10.txt'
  );
  const [fleetFileName, setFleetFileName] = useState<string>(
    'red.almacenes.flota.2026.txt'
  );

  const [notification, setNotification] = useState<string | null>(null);

  // Hidden file inputs
  const fileInputBlockagesRef = useRef<HTMLInputElement>(null);
  const fileInputOrdersRef = useRef<HTMLInputElement>(null);
  const fileInputMaintenanceRef = useRef<HTMLInputElement>(null);
  const fileInputFleetRef = useRef<HTMLInputElement>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Handlers for each file type
  const handleBlockagesFile = (file: File) => {
    setBlockagesFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const parsed = parseBlockedStreetsFile(text, file.name);
      if (parsed.blockages.length > 0) {
        onApplyBlockages(parsed.blockages, file.name);
        showNotification(`Se cargaron ${parsed.blockages.length} tramos bloqueados desde "${file.name}"`);
      } else {
        showNotification(`Archivo "${file.name}" cargado`);
      }
    };
    reader.readAsText(file);
  };

  const handleOrdersFile = (file: File) => {
    setOrdersFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const parsed = parseOrdersFile(text, file.name, warehouses);
      if (parsed.orders.length > 0) {
        onApplyOrders(parsed.orders, file.name);
        showNotification(`Se cargaron ${parsed.orders.length} pedidos desde "${file.name}"`);
      } else {
        showNotification(`Archivo "${file.name}" cargado`);
      }
    };
    reader.readAsText(file);
  };

  const handleMaintenanceFile = (file: File) => {
    setMaintenanceFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const parsed = parseMaintenanceFile(text, file.name);
      if (parsed.records.length > 0) {
        onApplyMaintenance(parsed.records, file.name);
        showNotification(`Se cargaron ${parsed.records.length} planes de mantenimiento desde "${file.name}"`);
      } else {
        showNotification(`Archivo "${file.name}" cargado`);
      }
    };
    reader.readAsText(file);
  };

  const handleFleetFile = (file: File) => {
    setFleetFileName(file.name);
    showNotification(`Configuración de red y flota "${file.name}" cargada correctamente`);
  };

  // Drag & drop helper
  const makeDropHandler = (handler: (f: File) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handler(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      id="home-page-container"
      className="flex-1 min-h-screen bg-[#00519E] flex flex-col items-center justify-center p-4 sm:p-8 select-none font-sans"
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputBlockagesRef}
        type="file"
        accept=".bloqueadas,.txt,.csv,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleBlockagesFile(e.target.files[0])}
      />
      <input
        ref={fileInputOrdersRef}
        type="file"
        accept=".txt,.csv,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleOrdersFile(e.target.files[0])}
      />
      <input
        ref={fileInputMaintenanceRef}
        type="file"
        accept=".txt,.csv,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleMaintenanceFile(e.target.files[0])}
      />
      <input
        ref={fileInputFleetRef}
        type="file"
        accept=".txt,.csv,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFleetFile(e.target.files[0])}
      />

      {/* Floating Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-white/95 text-slate-800 px-4 py-2.5 rounded-lg shadow-xl border border-slate-200 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Title as in reference image: Registro de datos */}
      <h1 className="text-white text-2xl sm:text-3xl font-bold tracking-wide italic mb-6 text-center drop-shadow-sm">
        Registro de datos
      </h1>

      {/* Main White Card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-4xl p-6 sm:p-10 lg:p-12 text-slate-800">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          
          {/* LEFT COLUMN: File Upload Blocks (Adapted to the GLP Logistics situation) */}
          <div className="space-y-5">
            {/* 1. CARGA MASIVA DE TRAMOS BLOQUEADOS */}
            <div className="space-y-1.5">
              <label className="text-[11px] sm:text-xs font-bold tracking-wider text-[#00519E] uppercase block">
                CARGA MASIVA DE TRAMOS BLOQUEADOS
              </label>
              <div
                onClick={() => fileInputBlockagesRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={makeDropHandler(handleBlockagesFile)}
                className="border-2 border-dashed border-slate-300 hover:border-[#00519E] rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-slate-500 hover:text-[#00519E] hover:bg-blue-50/40 cursor-pointer transition-all text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Subir o soltar archivo</span>
              </div>
              {blockagesFileName && (
                <div className="text-[11px] text-rose-500 font-mono tracking-tight break-all pl-1">
                  {blockagesFileName}
                </div>
              )}
            </div>

            {/* 2. CARGA MASIVA DE PEDIDOS Y VENTAS */}
            <div className="space-y-1.5">
              <label className="text-[11px] sm:text-xs font-bold tracking-wider text-[#00519E] uppercase block">
                CARGA MASIVA DE PEDIDOS Y VENTAS
              </label>
              <div
                onClick={() => fileInputOrdersRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={makeDropHandler(handleOrdersFile)}
                className="border-2 border-dashed border-slate-300 hover:border-[#00519E] rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-slate-500 hover:text-[#00519E] hover:bg-blue-50/40 cursor-pointer transition-all text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Subir o soltar archivo</span>
              </div>
              {ordersFileName && (
                <div className="text-[11px] text-rose-500 font-mono tracking-tight break-all pl-1">
                  {ordersFileName}
                </div>
              )}
            </div>

            {/* 3. CARGA MASIVA DE MANTENIMIENTO PREVENTIVO */}
            <div className="space-y-1.5">
              <label className="text-[11px] sm:text-xs font-bold tracking-wider text-[#00519E] uppercase block">
                CARGA MASIVA DE MANTENIMIENTO PREVENTIVO
              </label>
              <div
                onClick={() => fileInputMaintenanceRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={makeDropHandler(handleMaintenanceFile)}
                className="border-2 border-dashed border-slate-300 hover:border-[#00519E] rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-slate-500 hover:text-[#00519E] hover:bg-blue-50/40 cursor-pointer transition-all text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Subir o soltar archivo</span>
              </div>
              {maintenanceFileName && (
                <div className="text-[11px] text-rose-500 font-mono tracking-tight break-all pl-1">
                  {maintenanceFileName}
                </div>
              )}
            </div>

            {/* 4. CARGA MASIVA DE ALMACENES Y FLOTA */}
            <div className="space-y-1.5">
              <label className="text-[11px] sm:text-xs font-bold tracking-wider text-[#00519E] uppercase block">
                CARGA MASIVA DE ALMACENES Y FLOTA
              </label>
              <div
                onClick={() => fileInputFleetRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={makeDropHandler(handleFleetFile)}
                className="border-2 border-dashed border-slate-300 hover:border-[#00519E] rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-slate-500 hover:text-[#00519E] hover:bg-blue-50/40 cursor-pointer transition-all text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Subir o soltar archivo</span>
              </div>
              {fleetFileName && (
                <div className="text-[11px] text-rose-500 font-mono tracking-tight break-all pl-1">
                  {fleetFileName}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Brand Identity adapted to SysMile & Simulation Launch */}
          <div className="flex flex-col items-center justify-center text-center py-4 lg:pl-6">
            {/* Custom Logo representing GLP Fleet Logistics & Manhattan Distribution */}
            <div className="relative mb-3 flex items-center justify-center">
              <svg
                viewBox="0 0 240 180"
                className="w-48 sm:w-56 h-auto"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Manhattan Grid Lines & Route in Background */}
                <g stroke="#00519E" strokeOpacity="0.3" strokeWidth="2">
                  <line x1="30" y1="40" x2="210" y2="40" strokeDasharray="4 4" />
                  <line x1="30" y1="75" x2="210" y2="75" strokeDasharray="4 4" />
                  <line x1="30" y1="110" x2="210" y2="110" strokeDasharray="4 4" />
                  <line x1="30" y1="145" x2="210" y2="145" strokeDasharray="4 4" />
                  <line x1="50" y1="20" x2="50" y2="160" strokeDasharray="4 4" />
                  <line x1="90" y1="20" x2="90" y2="160" strokeDasharray="4 4" />
                  <line x1="130" y1="20" x2="130" y2="160" strokeDasharray="4 4" />
                  <line x1="170" y1="20" x2="170" y2="160" strokeDasharray="4 4" />
                </g>

                {/* Warehouse Node Marker (Origin) */}
                <circle cx="50" cy="75" r="9" fill="#00519E" />
                <rect x="45" y="70" width="10" height="10" fill="#FFFFFF" rx="1.5" />

                {/* Dynamic Route Line */}
                <path
                  d="M50 75 H130 V110 H170"
                  stroke="#00519E"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Heavy Fleet Tanker Truck (GLP Distribution) */}
                <g transform="translate(100, 60)">
                  {/* Truck Cabin */}
                  <path
                    d="M55 22 L72 22 C76 22 79 25 80 29 L84 42 L84 54 C84 56 82 58 80 58 L55 58 Z"
                    fill="#00519E"
                  />
                  {/* Windshield */}
                  <path
                    d="M58 26 L70 26 C72 26 74 28 75 30 L78 40 L58 40 Z"
                    fill="#E0F2FE"
                  />
                  {/* Tank Body (GLP Cylinder Tank) */}
                  <rect
                    x="2"
                    y="14"
                    width="50"
                    height="38"
                    rx="14"
                    fill="#00519E"
                    stroke="#003B75"
                    strokeWidth="2"
                  />
                  {/* Tank Highlights / Ribs */}
                  <line x1="16" y1="14" x2="16" y2="52" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5" />
                  <line x1="36" y1="14" x2="36" y2="52" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5" />
                  <circle cx="26" cy="33" r="6" fill="#FFFFFF" fillOpacity="0.9" />

                  {/* Truck Chassis */}
                  <rect x="0" y="52" width="78" height="6" fill="#002D5A" />

                  {/* Wheels */}
                  <circle cx="14" cy="58" r="8" fill="#1E293B" stroke="#CBD5E1" strokeWidth="2.5" />
                  <circle cx="14" cy="58" r="3.5" fill="#FFFFFF" />

                  <circle cx="36" cy="58" r="8" fill="#1E293B" stroke="#CBD5E1" strokeWidth="2.5" />
                  <circle cx="36" cy="58" r="3.5" fill="#FFFFFF" />

                  <circle cx="70" cy="58" r="8" fill="#1E293B" stroke="#CBD5E1" strokeWidth="2.5" />
                  <circle cx="70" cy="58" r="3.5" fill="#FFFFFF" />
                </g>

                {/* Delivery Destination Target Pin */}
                <g transform="translate(170, 110)">
                  <circle cx="0" cy="0" r="10" fill="#E11D48" />
                  <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
                  <circle cx="0" cy="0" r="15" stroke="#E11D48" strokeWidth="2" strokeOpacity="0.4" />
                </g>
              </svg>
            </div>

            {/* Brand Typography */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-black text-[#00519E] tracking-tight">
                SysMile
              </h2>
              <div className="text-xs sm:text-sm font-bold tracking-[0.25em] text-[#00519E] uppercase">
                DISTRIBUTION & LOGISTICS
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
