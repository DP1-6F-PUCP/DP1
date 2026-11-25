import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArchivoCargadoDTO } from '../../../types/backend';
import { fileStore, leerYParsearArchivos } from '../../../utils/fileStore';
import { parseBlockedStreetsFile, parseOrdersFile, parseMaintenanceFile } from '../../../utils/fileParser';
import { archivosApi } from '../../../services/archivosApi';
import { confirmar } from '../../../components/Confirmacion';
import { cuenta } from '../../configuracion/components/ui';
import { Warehouse } from '../../../types';

export type CategoriaArchivo = 'blockages' | 'orders' | 'maintenance';

const NOMBRE_CATEGORIA: Record<CategoriaArchivo, string> = { blockages: 'bloqueos', orders: 'pedidos', maintenance: 'mantenimiento' };

export interface EstadoSubida {
  tipo: 'success' | 'error' | 'info';
  mensaje: string;
}

/**
 * Unico punto de subida de archivos, usado por Configuración › Datos (CargaMasivaArchivos) -- antes dos componentes distintos
 * (DataFilesModal y el ya borrado SidebarDataFiles) reimplementaban por su cuenta, 3 veces cada
 * uno, el mismo FileReader+parse+dedupe (6 copias en total, confirmado en la revision de
 * codigo). Tambien antes NINGUNO llegaba al backend real
 * (POST /api/files/*, que existia desde la Fase A sin que nada lo llamara): el parseo local era
 * solo para previsualizar (conteo, nombre, contenido), la subida real es la que de verdad aplica
 * el archivo -- el backend no tiene un paso separado de "aplicar", aplica al recibirlo.
 */
export function useSubidaArchivos(warehouses: Warehouse[] = []) {
  const [, forceUpdate] = useState(0);
  useEffect(() => fileStore.subscribe(() => forceUpdate((v) => v + 1)), []);

  // Archivos cargados según el servidor (precargados y subidos a mano): la lista que se muestra y
  // desde la que se borra archivo por archivo. Se vuelve a pedir tras cada subida o borrado.
  const queryClient = useQueryClient();
  const { data: cargados = [] } = useQuery({
    queryKey: ['archivos-cargados'],
    queryFn: ({ signal }) => archivosApi.listar(signal),
    staleTime: 10_000,
  });
  const refrescarCargados = () => queryClient.invalidateQueries({ queryKey: ['archivos-cargados'] });

  const [estado, setEstado] = useState<EstadoSubida | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<CategoriaArchivo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ actual: number; total: number } | null>(null);

  // El resultado queda visible hasta la próxima subida o hasta cerrarlo (antes desaparecía a los
  // 3,5 s y un error largo del backend no alcanzaba a leerse).
  const mostrarEstado = (estadoNuevo: EstadoSubida) => setEstado(estadoNuevo);

  const subirPorLotes = async <T,>(items: File[], fn: (f: File) => Promise<T>, tamanoLote = 4): Promise<T[]> => {
    let completados = 0;
    const resultados: T[] = [];
    for (let i = 0; i < items.length; i += tamanoLote) {
      const lote = items.slice(i, i + tamanoLote);
      resultados.push(...await Promise.all(
        lote.map(async (f) => {
          const res = await fn(f);
          completados += 1;
          setUploadProgress({ actual: completados, total: items.length });
          return res;
        })
      ));
    }
    return resultados;
  };

  const procesarArchivos = async (categoria: CategoriaArchivo, files: File[]) => {
    if (files.length === 0) return;
    const ok = await confirmar({
      titulo: `¿Subir ${cuenta(files.length, 'archivo', 'archivos')} de ${NOMBRE_CATEGORIA[categoria]}?`,
      detalle: files.length === 1 ? files[0].name : 'Se aplican al subirlos.',
      accion: 'Subir',
      tono: 'crear',
    });
    if (!ok) return;
    setEstado(null);
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
        const resultados = await subirPorLotes(sortedFiles, (f) => archivosApi.cargarPedidos(f));
        fileStore.setOrdersFiles((prev) =>
          [...prev.filter((p) => !sortedFiles.some((f) => f.name === p.name)), ...entries].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        // Con simulación en curso: avisar los pedidos que NO entraron (vencidos o anteriores al inicio).
        const sumar = (k: 'incorporados' | 'programados' | 'anterioresAlInicio' | 'vencidos') =>
          resultados.reduce((s, r) => s + (r?.[k] ?? 0), 0);
        if (resultados.some((r) => r?.enSimulacion)) {
          const vencidos = sumar('vencidos');
          const anteriores = sumar('anterioresAlInicio');
          const partes = [`${cuenta(sumar('incorporados'), 'pedido entró', 'pedidos entraron')} ya`];
          const programados = sumar('programados');
          if (programados > 0) partes.push(`${cuenta(programados, 'entrará', 'entrarán')} a su hora`);
          const omitidos: string[] = [];
          if (vencidos > 0) omitidos.push(`${cuenta(vencidos, 'ya vencido', 'ya vencidos')}`);
          if (anteriores > 0) omitidos.push(`${cuenta(anteriores, 'anterior', 'anteriores')} al inicio`);
          mostrarEstado({
            tipo: omitidos.length > 0 ? 'info' : 'success',
            mensaje: `${partes.join(' · ')}.${omitidos.length > 0 ? ` No entraron: ${omitidos.join(' y ')}.` : ''}`,
          });
          return;
        }
      } else {
        const entries = await leerYParsearArchivos(sortedFiles, (c, n) => parseMaintenanceFile(c, n).records);
        await subirPorLotes(sortedFiles, (f) => archivosApi.cargarMantenimiento(f));
        fileStore.setMaintenanceFiles((prev) =>
          [...prev.filter((p) => !sortedFiles.some((f) => f.name === p.name)), ...entries].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
      mostrarEstado({ tipo: 'success', mensaje: files.length === 1 ? '1 archivo subido y aplicado.' : `${files.length} archivos subidos y aplicados.` });
    } catch (err) {
      mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'Error al procesar los archivos.' });
    } finally {
      setIsUploading(false);
      setUploadingCategory(null);
      setUploadProgress(null);
      void refrescarCargados();
    }
  };

  /** Borra en el servidor UN archivo subido a mano y sus datos. */
  const borrarArchivo = async (archivo: ArchivoCargadoDTO) => {
    if (!(await confirmar({
      titulo: `¿Borrar ${archivo.nombreArchivo}?`,
      detalle: `Se dejan de usar sus ${cuenta(archivo.filas, 'registro', 'registros')}. La simulación en curso conserva lo que ya tenía.`,
      accion: 'Borrar',
      tono: 'peligro',
    }))) return;
    try {
      await archivosApi.borrarArchivo(archivo.id);
      mostrarEstado({ tipo: 'success', mensaje: `Se borró ${archivo.nombreArchivo}.` });
    } catch (err) {
      mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'No se pudo borrar el archivo.' });
    } finally {
      void refrescarCargados();
    }
  };

  return {
    blockageFiles: fileStore.getBlockageFiles(),
    ordersFiles: fileStore.getOrdersFiles(),
    maintenanceFiles: fileStore.getMaintenanceFiles(),
    procesarArchivos,
    cargados,
    borrarArchivo,
    resetToSamples: async () => {
      if (await confirmar({ titulo: '¿Volver a los archivos de ejemplo?', detalle: 'Reemplaza la lista actual.', accion: 'Reemplazar', tono: 'peligro' })) {
        fileStore.resetToSamples(warehouses);
      }
    },
    /** Borra en el backend los datos cargados manualmente (DELETE /api/files) y vacía la lista. */
    limpiarTodo: async () => {
      if (!(await confirmar({ titulo: '¿Borrar todos los datos cargados?', detalle: 'Pedidos, bloqueos y mantenimientos subidos a mano. No se puede deshacer.', accion: 'Borrar', tono: 'peligro' }))) return;
      try {
        await archivosApi.limpiarArchivos();
        fileStore.clearAll();
        mostrarEstado({ tipo: 'success', mensaje: 'Se borraron los datos cargados manualmente.' });
      } catch (err) {
        mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'No se pudieron borrar los datos cargados.' });
      } finally {
        void refrescarCargados();
      }
    },
    /** Borra TODO, también los datos estándar precargados (prueba de sistema sin datos). */
    borrarTodo: async () => {
      if (!(await confirmar({
        titulo: '¿Borrar todos los datos?',
        detalle: 'Pedidos, calles bloqueadas y mantenimientos: los precargados y los subidos a mano. Los precargados se recuperan con «Cargar».',
        accion: 'Borrar todo',
        tono: 'peligro',
      }))) return;
      try {
        await archivosApi.borrarTodo();
        fileStore.clearAll();
        mostrarEstado({ tipo: 'success', mensaje: 'Se borraron todos los datos. Para recuperar los precargados, usa «Cargar».' });
      } catch (err) {
        mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'No se pudieron borrar los datos.' });
      } finally {
        void refrescarCargados();
      }
    },
    /** Vuelve a cargar los datos precargados que falten (tras borrarTodo). */
    restaurarEstandar: async () => {
      if (!(await confirmar({
        titulo: '¿Cargar los datos precargados?',
        detalle: 'Vuelve a cargar los pedidos, calles bloqueadas y mantenimientos que falten.',
        accion: 'Cargar',
        tono: 'crear',
      }))) return;
      try {
        setIsUploading(true);
        await archivosApi.restaurarEstandar();
        mostrarEstado({ tipo: 'success', mensaje: 'Datos precargados listos.' });
      } catch (err) {
        mostrarEstado({ tipo: 'error', mensaje: (err as Error)?.message || 'No se pudieron cargar los datos.' });
      } finally {
        setIsUploading(false);
        void refrescarCargados();
      }
    },
    estado,
    cerrarEstado: () => setEstado(null),
    isUploading,
    uploadingCategory,
    uploadProgress,
  };
}
