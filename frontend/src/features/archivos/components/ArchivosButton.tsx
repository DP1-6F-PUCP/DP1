import React, { useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { DataFilesModal } from '../../../components/DataFilesModal';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';

/**
 * Unico punto de entrada a DataFilesModal -- no hay una version "compacta" aparte (existia
 * SidebarDataFiles con la misma funcionalidad pero nunca se montaba en ningun lado; se borro en
 * vez de montarla tambien, para no tener la misma funcionalidad duplicada en pantalla).
 */
export const ArchivosButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { warehouses } = useEstadoOperacion();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Subir archivos (pedidos, bloqueos, mantenimiento)"
        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-blue-500/40 transition-colors"
      >
        <FileCode2 className="h-3.5 w-3.5" />
      </button>
      <DataFilesModal isOpen={isOpen} onClose={() => setIsOpen(false)} warehouses={warehouses} isDarkTheme={true} />
    </>
  );
};
