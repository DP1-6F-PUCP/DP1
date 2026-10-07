import React from 'react';
import { Order, Warehouse, Vehicle } from '../types';
import { AlertOctagon, Clock, X, MapPin, Package, CheckCircle2, Download } from 'lucide-react';
import { Button } from './ui/Button';
import { jsPDF } from 'jspdf';

interface DelayAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  simTime: string;
  simMinute: number;
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  /** Sin equivalente real en el backend (no hay "reset" de alertas, GET /api/alerts se recalcula
   * solo); opcional para que un caller como AlertasBell no tenga que inventar un no-op. */
  onResetAlertsAndFailures?: () => void;
  isDarkTheme?: boolean;
}

export const DelayAlertModal: React.FC<DelayAlertModalProps> = ({
  isOpen,
  onClose,
  order,
  simTime,
  simMinute,
  warehouses,
  vehicles,
  onResetAlertsAndFailures,
  isDarkTheme = true,
}) => {
  if (!isOpen) return null;

  const originWarehouse = order
    ? warehouses.find((w) => w.id === order.warehouseOriginId)
    : null;
  const assignedVehicle = order?.assignedVehicleId
    ? vehicles.find((v) => v.id === order.assignedVehicleId)
    : null;

  const delayMinutes = order ? Math.max(0, simMinute - order.deadlineMinute) : 0;

  const handleDownloadPdf = () => {
    if (!order) return;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Background header bar
    doc.setFillColor(31, 56, 100); // #1F3864
    doc.rect(0, 0, 210, 28, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SYSMILE - REPORTE DE INCIDENCIA OPERATIVA', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Alerta Crítica: Pedido con Retraso (SLA Excedido)', 14, 21);

    // Metadata section
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(9);
    doc.text(`Fecha de Emisión: ${new Date().toLocaleString()}`, 14, 36);
    doc.text(`Hora Simulada de Detección: ${simTime} (Minuto ${simMinute})`, 14, 42);

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 46, 196, 46);

    // Section 1: Datos del Pedido
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(198, 40, 40); // #C62828 Danger
    doc.text('1. INFORMACIÓN DEL PEDIDO EN RETRASO', 14, 54);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);

    const leftColX = 16;
    const valColX = 75;
    let currY = 62;

    const addRow = (label: string, value: string, isAlert = false) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text(label, leftColX, currY);
      doc.setFont('helvetica', isAlert ? 'bold' : 'normal');
      if (isAlert) {
        doc.setTextColor(198, 40, 40);
      } else {
        doc.setTextColor(30, 30, 30);
      }
      doc.text(value, valColX, currY);
      currY += 7;
    };

    addRow('Código de Pedido:', order.code || order.id);
    addRow('Retraso Calculado:', `+${delayMinutes} minutos excedidos`, true);
    addRow('Plazo Máximo SLA:', `Minuto ${order.deadlineMinute} de simulación`);
    addRow('Almacén de Despacho:', originWarehouse ? `${originWarehouse.name} (${originWarehouse.code})` : 'Almacén Central');
    addRow('Coordenadas Almacén:', originWarehouse ? `X = ${originWarehouse.coords.x} km, Y = ${originWarehouse.coords.y} km` : 'N/D');
    addRow('Coordenadas Destino:', `X = ${order.destination.x} km, Y = ${order.destination.y} km`);
    addRow('Carga / Paquetes:', `${order.quantity || 1} paquete(s)`);

    // Separator
    currY += 3;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, currY, 196, currY);
    currY += 8;

    // Section 2: Vehículo Asignado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 56, 100);
    doc.text('2. UNIDAD Y LOGÍSTICA DE TRANSPORTE', 14, currY);
    currY += 8;

    if (assignedVehicle) {
      addRow('Código de Vehículo:', assignedVehicle.code);
      addRow('Tipo de Unidad:', assignedVehicle.type === 'car' ? 'Automóvil (TA)' : assignedVehicle.type === 'motorcycle' ? 'Motocicleta (TM)' : 'Bicicleta (TB)');
      addRow('Capacidad y Carga:', `${assignedVehicle.currentLoad} / ${assignedVehicle.capacity} paquetes`);
      addRow('Velocidad Nominal:', `${assignedVehicle.speed} km/h`);
      addRow('Estado de la Unidad:', assignedVehicle.status === 'broken' ? 'Averiado / En mantenimiento' : assignedVehicle.status.toUpperCase(), assignedVehicle.status === 'broken');
    } else {
      addRow('Unidad Asignada:', 'Sin vehículo asignado (En espera de flota disponible)');
    }

    // Separator
    currY += 3;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, currY, 196, currY);
    currY += 8;

    // Section 3: Normativa y Acciones
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 56, 100);
    doc.text('3. RESOLUCIÓN OPERATIVA Y DICTAMEN', 14, currY);
    currY += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const rulesText = [
      '• El sistema ha aplicado la condición de parada operativa automática por tolerancia cero a retrasos de entrega.',
      '• Se ha pausado la simulación para permitir el análisis de la ruta y la replanificación de la flota.',
      '• Las métricas y alertas del incidente han sido registradas para el análisis de post-mórtem logístico.',
    ];
    rulesText.forEach((line) => {
      doc.text(line, 16, currY);
      currY += 6;
    });

    // Footer
    doc.setFillColor(245, 246, 248);
    doc.rect(0, 280, 210, 17, 'F');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('SYSMILE Fleet Routing System · Documento Oficial de Auditoría Logística', 14, 289);
    doc.text('Página 1 de 1', 180, 289);

    doc.save(`Reporte_Retraso_${order.code || 'Pedido'}.pdf`);
  };

  return (
    <div
      id="modal-delay-alert-backdrop"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
    >
      <div
        id="modal-delay-alert-container"
        className={`w-full max-w-lg border-2 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 transition-colors ${
          isDarkTheme
            ? 'bg-slate-900 border-red-500/80 text-slate-100'
            : 'bg-[var(--color-surface)] border-[var(--color-danger)] text-[var(--color-text-primary)] shadow-2xl'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between border-b pb-4 ${
            isDarkTheme ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-red-500/20 border-2 border-red-500 text-[var(--color-danger)] shrink-0">
              <AlertOctagon className="h-7 w-7" />
            </div>
            <div>
              <h2
                className={`font-bold text-lg ${
                  isDarkTheme ? 'text-white' : 'text-[var(--color-text-primary)]'
                }`}
              >
                Pedido con Retraso Detectado
              </h2>
              <p
                className={`text-xs mt-0.5 ${
                  isDarkTheme ? 'text-slate-400' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                Hora de reporte:{" "}
                <span
                  className={`font-mono-code font-semibold ${
                    isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {simTime}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="btn-close-delay-modal-icon"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDarkTheme
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-slate-100'
              }`}
              title="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Order Details Card */}
        {order && (
          <div
            className={`border rounded-xl p-3.5 space-y-3 ${
              isDarkTheme
                ? 'bg-slate-950/70 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-code font-bold text-blue-500 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> {order.code}
              </span>
              <span className="text-xs font-mono-code font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                +{delayMinutes} min de retraso
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                className={`p-2 rounded-lg border ${
                  isDarkTheme
                    ? 'bg-slate-900/90 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span
                  className={`text-[10px] block mb-0.5 ${
                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Almacén Origen
                </span>
                <span
                  className={`font-medium ${
                    isDarkTheme ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {originWarehouse ? originWarehouse.name : 'Almacén Central'}
                </span>
              </div>

              <div
                className={`p-2 rounded-lg border ${
                  isDarkTheme
                    ? 'bg-slate-900/90 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span
                  className={`text-[10px] block mb-0.5 ${
                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Destino Entrega
                </span>
                <span
                  className={`font-medium font-mono-code flex items-center gap-1 ${
                    isDarkTheme ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  <MapPin className="h-3 w-3 text-red-500" />
                  ({order.destination.x}, {order.destination.y})
                </span>
              </div>

              <div
                className={`p-2 rounded-lg border ${
                  isDarkTheme
                    ? 'bg-slate-900/90 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span
                  className={`text-[10px] block mb-0.5 ${
                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Límite SLA
                </span>
                <span
                  className={`font-mono-code font-semibold flex items-center gap-1 ${
                    isDarkTheme ? 'text-amber-300' : 'text-amber-600'
                  }`}
                >
                  <Clock className="h-3 w-3 text-amber-500" />
                  Min {order.deadlineMinute} (Superado)
                </span>
              </div>

              <div
                className={`p-2 rounded-lg border ${
                  isDarkTheme
                    ? 'bg-slate-900/90 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span
                  className={`text-[10px] block mb-0.5 ${
                    isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Unidad Asignada
                </span>
                <span
                  className={`font-mono-code font-medium ${
                    isDarkTheme ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {assignedVehicle
                    ? `${assignedVehicle.code} (${
                        assignedVehicle.type === 'car'
                          ? 'Auto · TA'
                          : assignedVehicle.type === 'bicycle'
                          ? 'Bicicleta · TB'
                          : 'Moto · TM'
                      })`
                    : 'Sin asignar / en espera'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions con botón para descargar PDF */}
        <div
          className={`flex flex-col sm:flex-row items-center gap-2 pt-3 border-t ${
            isDarkTheme ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <Button
            id="btn-download-delay-pdf"
            variant="outline"
            onClick={handleDownloadPdf}
            className={`w-full sm:w-auto flex-1 justify-center border font-semibold ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-100'
                : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Download className="h-4 w-4 mr-1.5 text-blue-500" />
            Descargar PDF
          </Button>

          <Button
            id="btn-confirm-reset-alerts-and-close"
            variant="primary"
            onClick={() => {
              onResetAlertsAndFailures?.();
              onClose();
            }}
            className="w-full sm:w-auto flex-1 justify-center"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
};
