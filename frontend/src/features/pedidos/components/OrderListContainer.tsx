import React, { useState } from 'react';
import { useOrders } from '../hooks/useOrders';
import { OrderCard } from './OrderCard';
import { Order } from '../../../types';
import { useToast } from '../../../components/ToastProvider';
import { Search, Filter, Loader2, Package } from 'lucide-react';

export const OrderListContainer: React.FC = () => {
  const { orders, isLoading, isError, assignVehicle } = useOrders();
  const { addToast } = useToast();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_time' | 'at_risk' | 'delayed' | 'delivered'>('all');

  const handleSelectOrder = (order: Order) => {
    setSelectedOrderId(order.id);
  };

  const handleAssignToVehicle = (orderId: string) => {
    assignVehicle(
      { orderId, vehicleId: 'veh-ta01' },
      {
        onSuccess: () => {
          addToast({
            type: 'success',
            title: 'Pedido asignado',
            description: `Se asignó la unidad vehicular al pedido ${orderId}`,
          });
        },
      }
    );
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.clientId && o.clientId.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        <span className="text-xs">Cargando pedidos de despacho...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs">
        Ocurrió un error al obtener la lista de pedidos activos.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Filtros y Búsqueda */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código de pedido o cliente..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {(['all', 'on_time', 'at_risk', 'delayed', 'delivered'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                statusFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter === 'all'
                ? 'Todos'
                : filter === 'on_time'
                ? 'A tiempo'
                : filter === 'at_risk'
                ? 'En riesgo'
                : filter === 'delayed'
                ? 'Retrasados'
                : 'Entregados'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
            <Package className="h-8 w-8 text-slate-600" />
            <span>No se encontraron pedidos con estos filtros.</span>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isSelected={selectedOrderId === order.id}
              onSelectOrder={handleSelectOrder}
              onAssignToVehicle={handleAssignToVehicle}
            />
          ))
        )}
      </div>
    </div>
  );
};
