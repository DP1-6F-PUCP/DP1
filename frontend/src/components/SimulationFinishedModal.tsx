import React from 'react';
import { jsPDF } from 'jspdf';
import { 
  AlertCircle, 
  X, 
  Package, 
  MapPin, 
  Download, 
  CheckCircle2 
} from 'lucide-react';
import { Order } from '../types/order';
import { Vehicle } from '../types/vehicle';

interface DelayAlertModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onAccept: () => void;
  order: Order | null;
  vehicle: Vehicle | null;
}

export const DelayAlertModal: React.FC<DelayAlertModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  order,
  vehicle,
}) => {
  if (!isOpen) return null;

  const orderCode = order?.code || order?.id || 'No disponible';
  const destination = order
    ? `(${order.destination.x}, ${order.destination.y})`
    : 'No disponible';
  const vehicleCode = vehicle?.code || 'Sin unidad asignada';

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const emittedAt = new Date();

    doc.setFillColor(31, 56, 100);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SYSMILE - REPORTE DE SIMULACION', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Incidencia operativa detectada', 14, 21);

    doc.setTextColor(45, 45, 45);
    doc.setFontSize(9);
    doc.text(`Fecha de emision: ${emittedAt.toLocaleString()}`, 14, 38);
    doc.line(14, 43, 196, 43);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(198, 40, 40);
    doc.text('INFORMACION DEL PEDIDO', 14, 53);

    const rows = [
      ['Pedido', orderCode],
      ['Estado', 'Pedido incumplido'],
      ['Cliente', order?.clientId || 'No disponible'],
      ['Cantidad solicitada', `${order?.quantity ?? 'No disponible'}`],
      ['Destino de entrega', destination],
      ['Unidad asignada', vehicleCode],
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    rows.forEach(([label, value], index) => {
      const y = 64 + index * 9;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(70, 70, 70);
      doc.text(`${label}:`, 16, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(value, 75, y);
    });

    doc.setDrawColor(210, 210, 210);
    doc.line(14, 140, 196, 140);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text('Reporte generado desde el sistema de planificacion PaqRap.', 14, 149);

    doc.save(`reporte-simulacion-${emittedAt.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delay-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm animate-in fade-in"
    >
      {/* Contenedor principal con borde rojo */}
      <div className="relative w-full max-w-xl rounded-xl border border-red-500 bg-[#121722] p-4 text-slate-100 shadow-2xl animate-in zoom-in-95">
        
        {/* Botón Cerrar (X) superior derecho */}
        <button 
          onClick={onClose}
          className="absolute right-3 top-3 text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Cabecera */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-red-500/80 bg-red-500/10 text-red-500">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="delay-modal-title" className="text-lg font-bold text-white">
              Pedido que detuvo la simulación
            </h2>
          </div>
        </div>

        {/* Tarjeta central oscura */}
        <div className="rounded-lg border border-slate-700 bg-[#0a0f18] p-3">
          {/* Header de la tarjeta */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400">
              <Package className="h-4 w-4" />
              <span className="font-semibold tracking-wide">{orderCode}</span>
            </div>
            <div className="rounded border border-red-900/50 bg-red-950/40 px-2 py-1 text-xs font-semibold text-red-500">
              Pedido incumplido
            </div>
          </div>

          {/* Datos del pedido */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-md border border-slate-700/60 bg-[#141a27] p-2">
              <p className="mb-0.5 text-[11px] text-slate-400">Cliente</p>
              <p className="text-xs font-semibold text-white">{order?.clientId || 'No disponible'}</p>
            </div>
            
            <div className="rounded-md border border-slate-700/60 bg-[#141a27] p-2">
              <p className="mb-0.5 text-[11px] text-slate-400">Destino Entrega</p>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <MapPin className="h-3.5 w-3.5 text-red-500" />
                {destination}
              </p>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-[#141a27] p-2">
              <p className="mb-0.5 text-[11px] text-slate-400">Cantidad solicitada</p>
              <p className="text-xs font-semibold text-white">{order?.quantity ?? 'No disponible'}</p>
            </div>

            <div className="rounded-md border border-slate-700/60 bg-[#141a27] p-2">
              <p className="mb-0.5 text-[11px] text-slate-400">Unidad Asignada</p>
              <p className="text-xs font-semibold text-white">{vehicleCode}</p>
            </div>
          </div>
        </div>

        {/* Botones de acción inferiores */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-transparent px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Download className="h-4 w-4 text-blue-400" />
            Descargar PDF
          </button>
          
          <button
            type="button"
            onClick={onAccept}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2a437a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#355498] focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CheckCircle2 className="h-4 w-4" />
            Aceptar
          </button>
        </div>

      </div>
    </div>
  );
};

export const SimulationFinishedModal: React.FC<{
  isOpen: boolean;
  onAccept: () => void;
  order: Order | null;
  vehicle: Vehicle | null;
}> = ({ isOpen, onAccept, order, vehicle }) => (
  <DelayAlertModal
    isOpen={isOpen}
    onAccept={onAccept}
    onClose={onAccept}
    order={order}
    vehicle={vehicle}
  />
);