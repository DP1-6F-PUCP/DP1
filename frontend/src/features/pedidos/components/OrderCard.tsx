import React from 'react';
import { Order } from '../../../types';
import { StatusBadge } from '../../../components/StatusBadge';
import { Package, MapPin, Clock, Truck } from 'lucide-react';

export interface OrderCardProps {
  order: Order;
  isSelected?: boolean;
  onSelectOrder?: (order: Order) => void;
  onAssignToVehicle?: (orderId: string) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  isSelected = false,
  onSelectOrder,
  onAssignToVehicle,
}) => {
  return (
    <div
      onClick={() => onSelectOrder?.(order)}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
        isSelected
          ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/50 shadow-md'
          : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-700/60 text-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <span className="font-mono-code font-bold text-sm text-white">
              {order.code}
            </span>
            {order.clientId && (
              <span className="text-[10px] text-slate-400 ml-1.5 font-mono-code">
                Cliente: {order.clientId}
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={order.status} type="order" size="sm" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs my-2">
        <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[9px] text-slate-400 block">Destino</span>
            <span className="font-mono-code font-semibold text-slate-100 truncate block">
              X={order.destination.x}, Y={order.destination.y}
            </span>
          </div>
        </div>

        <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[9px] text-slate-400 block">Límite SLA</span>
            <span className="font-mono-code font-semibold text-slate-100">
              Min {order.deadlineMinute}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
        <span className="text-slate-400 font-mono-code flex items-center gap-1">
          <Truck className="h-3 w-3 text-slate-500" />
          {order.assignedVehicleId ? (
            <span className="text-blue-400 font-semibold">{order.assignedVehicleId}</span>
          ) : (
            <span className="text-amber-400">Sin asignar</span>
          )}
        </span>

        {onAssignToVehicle && !order.assignedVehicleId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssignToVehicle(order.id);
            }}
            className="text-[10px] font-semibold py-1 px-2 rounded-lg bg-blue-600/30 text-blue-300 border border-blue-500/40 hover:bg-blue-600/40 transition-colors"
          >
            Asignar Unidad
          </button>
        )}
      </div>
    </div>
  );
};
