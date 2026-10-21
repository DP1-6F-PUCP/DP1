import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileCode2, Layers, Package, Upload, Wrench } from 'lucide-react';
import { Warehouse } from '../types';
import { CategoriaArchivo, useSubidaArchivos } from '../features/archivos/hooks/useSubidaArchivos';
import { fileStore } from '../utils/fileStore';

interface DataFilesPageProps {
  warehouses: Warehouse[];
}

const cards: {
  category: CategoriaArchivo | 'fleet';
  title: string;
  description: string;
  format: string;
  icon: typeof Layers;
  color: string;
}[] = [
  {
    category: 'blockages',
    title: '1. CARGA MASIVA DE TRAMOS BLOQUEADOS',
    description: 'Archivos con coordenadas de calles bloqueadas o tramos interrumpidos en la malla Manhattan.',
    format: '.bloqueadas, .txt, .csv',
    icon: Layers,
    color: 'blue',
  },
  {
    category: 'orders',
    title: '2. CARGA MASIVA DE PEDIDOS Y VENTAS',
    description: 'Plan de pedidos programados con coordenadas destino, bultos y ventana de entrega SLA.',
    format: '.txt, .csv (ventas202609)',
    icon: Package,
    color: 'emerald',
  },
  {
    category: 'maintenance',
    title: '3. CARGA MASIVA DE MANTENIMIENTO PREVENTIVO',
    description: 'Planes bimestrales de mantenimiento preventivo (00:00 a 23:59) para vehículos de la flota.',
    format: '.txt (mant.preventivo.09.10)',
    icon: Wrench,
    color: 'amber',
  },
  {
    category: 'fleet',
    title: '4. CARGA MASIVA DE ALMACENES Y FLOTA',
    description: 'Configuración nodal de almacenes y unidades de flota (TA, TM, TB).',
    format: '.txt, .csv, .json',
    icon: FileCode2,
    color: 'purple',
  },
];

const colorClasses = {
  blue: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 hover:border-blue-500 dark:hover:border-blue-400',
  emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-400',
  amber: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 hover:border-amber-500 dark:hover:border-amber-400',
  purple: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 hover:border-purple-500 dark:hover:border-purple-400',
} as const;

export const DataFilesPage: React.FC<DataFilesPageProps> = ({ warehouses }) => {
  const { blockageFiles, ordersFiles, maintenanceFiles, procesarArchivos, estado, isUploading } =
    useSubidaArchivos(warehouses);
  const [, setVersion] = useState(0);
  const [fleetFile, setFleetFile] = useState<string | null>(null);
  const [fleetInputKey, setFleetInputKey] = useState(0);
  const fleetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => fileStore.subscribe(() => setVersion((value) => value + 1)), []);

  const filesByCategory = {
    blockages: blockageFiles,
    orders: ordersFiles,
    maintenance: maintenanceFiles,
  };

  const upload = async (category: CategoriaArchivo, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    await procesarArchivos(category, files);
    event.target.value = '';
  };

  const uploadFleet = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setFleetFile(file.name);
    setFleetInputKey((value) => value + 1);
  };

  return (
    <div id="data-files-page" className="flex-1 h-full overflow-y-auto bg-[#F5F6F8] px-4 py-6 text-slate-900 transition-colors dark:bg-[#0B111E] dark:text-slate-100 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="border-b border-slate-200 pb-5 dark:border-slate-700">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Registro y Carga Masiva de Datos
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Cargue los archivos planos de tramos bloqueados, pedidos y ventas, mantenimiento preventivo y red de flota.
          </p>
        </div>

        {estado && (
          <div className="fixed right-6 top-6 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/50 bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-2xl">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{estado.mensaje}</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            const files = card.category === 'fleet' ? [] : filesByCategory[card.category];
            const palette = colorClasses[card.color as keyof typeof colorClasses];
            return (
              <section key={card.category} className="flex min-h-[330px] flex-col justify-between space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-[#131D31] dark:hover:border-slate-500">
                <div>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className={`flex items-center gap-2 text-xs font-bold tracking-wider ${palette.split(' ')[0]}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{card.title}</span>
                    </h2>
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-mono-code ${palette}`}>
                      {card.category === 'fleet' ? fleetFile ?? 'red.almacenes.flota' : `${files.reduce((sum, file) => sum + file.count, 0)} registros`}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{card.description}</p>
                  <label className={`flex h-[138px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-xs font-medium text-slate-600 transition-all dark:border-slate-600 dark:text-slate-300 ${palette}`}>
                    <span className={`rounded-full p-2.5 ${palette.split(' ')[1]} ${palette.split(' ')[0]}`}>
                      <Upload className="h-4 w-4" />
                    </span>
                    <span>{isUploading && card.category !== 'fleet' ? 'Subiendo...' : 'Haga clic para subir o arrastre el archivo aquí'}</span>
                    <span className="font-mono-code text-[10px] text-slate-400 dark:text-slate-500">Formatos: {card.format}</span>
                    <input
                      key={card.category === 'fleet' ? fleetInputKey : card.category}
                      type="file"
                      multiple={card.category !== 'fleet'}
                      accept={card.category === 'fleet' ? '.txt,.csv,.json' : card.category === 'blockages' ? '.bloqueadas,.txt,.csv' : card.category === 'orders' ? '.txt,.csv' : '.txt,.csv'}
                      className="hidden"
                      disabled={isUploading && card.category !== 'fleet'}
                      ref={card.category === 'fleet' ? fleetInputRef : undefined}
                      onChange={card.category === 'fleet' ? uploadFleet : (event) => upload(card.category as CategoriaArchivo, event)}
                    />
                  </label>
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-2 dark:border-slate-700">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {files.length || fleetFile ? 'ARCHIVO ACTIVO:' : 'ARCHIVOS ACTIVOS EN MEMORIA:'}
                  </span>
                  {card.category === 'fleet' ? (
                    fleetFile && <div className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-mono-code text-purple-700 dark:bg-slate-800 dark:text-purple-300">{fleetFile}</div>
                  ) : (
                    files.map((file) => (
                      <div key={file.name} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] dark:bg-slate-800">
                        <span className={`font-mono-code font-medium ${palette.split(' ')[0]}`}>{file.name}</span>
                        <span className="font-mono-code text-slate-500 dark:text-slate-400">{file.count} registros</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
