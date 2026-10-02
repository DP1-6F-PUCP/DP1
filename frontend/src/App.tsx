import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScenarioType,
  Warehouse,
  Vehicle,
  BlockedStreet,
  Order,
  AlertItem,
  SimulationState,
  SystemConfig,
  BreakdownType,
  BreakdownInfo,
  PreventiveMaintenanceRecord,
} from './types';
import {
  parseMaintenanceFile,
  SAMPLE_MAINTENANCE_FILE_CONTENT,
} from './utils/fileParser';
import {
  INITIAL_WAREHOUSES,
  INITIAL_BLOCKED_STREETS,
  generateManhattanPath,
} from './utils/manhattan';
import {
  INITIAL_CONFIG,
  createInitialFleet,
  createInitialOrders,
  createInitialAlerts,
  createInitialSimState,
  getRandomGridPoint,
  formatSimulatedTime,
  getShiftFromDate,
  calculateBreakdownParameters,
} from './utils/simulation';
import { SidebarLeft } from './components/SidebarLeft';
import { CentralMap } from './components/CentralMap';
import { SidebarRight } from './components/SidebarRight';
import { BreakdownModal } from './components/BreakdownModal';
import { ConfigModal } from './components/ConfigModal';
import { ToastContainer } from './components/ToastContainer';
import { DelayAlertModal } from './components/DelayAlertModal';
import { DataFilesModal } from './components/DataFilesModal';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { ToastProvider } from './components/ToastProvider';
import { LiveAnnouncer } from './components/LiveAnnouncer';

export default function App() {
  // Config & Theme state
  const [config, setConfig] = useState<SystemConfig>(INITIAL_CONFIG);

  // Core Data
  const [warehouses, setWarehouses] = useState<Warehouse[]>(INITIAL_WAREHOUSES);
  const [blockedStreets, setBlockedStreets] = useState<BlockedStreet[]>(INITIAL_BLOCKED_STREETS);
  const [vehicles, setVehicles] = useState<Vehicle[]>(() =>
    createInitialFleet(INITIAL_CONFIG.fleetCounts, INITIAL_WAREHOUSES, INITIAL_BLOCKED_STREETS)
  );
  const [orders, setOrders] = useState<Order[]>(() =>
    createInitialOrders(vehicles, INITIAL_WAREHOUSES)
  );
  const [maintenanceRecords, setMaintenanceRecords] = useState<PreventiveMaintenanceRecord[]>(() =>
    parseMaintenanceFile(SAMPLE_MAINTENANCE_FILE_CONTENT, 'mant.preventivo.09.10').records
  );
  const [alerts, setAlerts] = useState<AlertItem[]>(createInitialAlerts);
  const [toasts, setToasts] = useState<AlertItem[]>([]);
  const [simState, setSimState] = useState<SimulationState>(createInitialSimState);

  // Layout states
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<'operation' | 'files'>('operation');

  // Inspection selections
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>();

  // Modals
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isDataFilesModalOpen, setIsDataFilesModalOpen] = useState<boolean>(false);
  const [delayedOrderForModal, setDelayedOrderForModal] = useState<Order | null>(null);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState<boolean>(false);

  // Ref to hold current state for interval loop without stale closure
  const stateRef = useRef({
    simState,
    vehicles,
    orders,
    warehouses,
    blockedStreets,
    config,
    maintenanceRecords,
  });

  useEffect(() => {
    stateRef.current = {
      simState,
      vehicles,
      orders,
      warehouses,
      blockedStreets,
      config,
      maintenanceRecords,
    };
  }, [simState, vehicles, orders, warehouses, blockedStreets, config, maintenanceRecords]);

  // Toast / Alert triggers
  const triggerAlertWithToast = useCallback((newAlert: AlertItem) => {
    setToasts((prev) => (prev.some((t) => t.id === newAlert.id) ? prev : [newAlert, ...prev]));
    setAlerts((prev) => (prev.some((a) => a.id === newAlert.id) ? prev : [newAlert, ...prev]));
  }, []);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fleet count synchronization
  useEffect(() => {
    setVehicles((prev) => {
      const currentCars = prev.filter((v) => v.type === 'car').length;
      const currentMotos = prev.filter((v) => v.type === 'motorcycle').length;
      const currentBikes = prev.filter((v) => v.type === 'bicycle').length;

      if (
        currentCars === config.fleetCounts.car &&
        currentMotos === config.fleetCounts.motorcycle &&
        currentBikes === config.fleetCounts.bicycle
      ) {
        return prev;
      }

      return createInitialFleet(config.fleetCounts, warehouses, blockedStreets);
    });
  }, [config.fleetCounts, warehouses, blockedStreets]);

  // Switch Scenario handler
  const handleSelectScenario = (sc: ScenarioType) => {
    if (sc === 'collapse') {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      triggerAlertWithToast({
        id: `alt-collapse-mode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'sla_risk',
        title: 'Escenario de Estrés y Colapso Iniciado',
        description:
          'Demanda de pedidos incrementada al límite. Alta probabilidad de saturación de almacenes y quiebre de SLA.',
        urgency: 'high',
        timestamp: timeStr,
        simMinute: simState.simMinutes,
        location: { x: 35, y: 25 },
      });
    }

    setSimState((prev) => {
      let collapseScore = 32;
      let timeToCollapseEstHours = 19.2;
      let day = 1;

      if (sc === 'collapse') {
        collapseScore = 74;
        timeToCollapseEstHours = 4.2;
      } else if (sc === 'five_days') {
        collapseScore = 48;
        timeToCollapseEstHours = 14.0;
        day = 2;
      }

      return {
        ...prev,
        scenario: sc,
        collapseScore,
        timeToCollapseEstHours,
        day,
        isCollapsed: false,
        speedMultiplier: sc === 'five_days' ? (prev.speedMultiplier > 1 ? prev.speedMultiplier : 2) : 1,
      };
    });
  };

  // Play / Pause simulation
  const handleTogglePlayPause = () => {
    setSimState((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  };

  // Reset simulation
  const handleResetSimulation = () => {
    setSimState(createInitialSimState());
    setAlerts(createInitialAlerts());
    setWarehouses(
      INITIAL_WAREHOUSES.map((w) => ({
        ...w,
        currentStock: Number.isFinite(w.capacity) ? w.capacity : w.currentStock,
      }))
    );
    setVehicles(createInitialFleet(config.fleetCounts, INITIAL_WAREHOUSES, blockedStreets));
    setOrders(createInitialOrders(vehicles, INITIAL_WAREHOUSES));
  };

  // Speed multiplier change - restricted to 5-day simulation
  const handleChangeSpeed = (speed: number) => {
    if (simState.scenario === 'five_days') {
      setSimState((prev) => ({ ...prev, speedMultiplier: speed }));
    }
  };

  // User selects simulation start date
  const handleStartDateChange = (dateStr: string) => {
    if (!dateStr) return;
    const [year, month, day] = dateStr.split('-').map(Number);
    const newStartDate = new Date(year, month - 1, day, 7, 0, 0, 0);
    const { shift: newShift } = getShiftFromDate(newStartDate);

    setSimState((prev) => ({
      ...prev,
      startDate: newStartDate,
      simMinutes: 0,
      day: 1,
      shift: newShift,
      isCollapsed: false,
      collapseCause: undefined,
    }));
    setWarehouses(
      INITIAL_WAREHOUSES.map((w) => ({
        ...w,
        currentStock: Number.isFinite(w.capacity) ? w.capacity : w.currentStock,
      }))
    );
    setOrders(createInitialOrders(vehicles, INITIAL_WAREHOUSES));
  };

  // Create breakdown logic
  const handleCreateBreakdown = useCallback(
    (targetVehicleId: string, type: BreakdownType = 1, reason?: string) => {
      const targetVehicle = vehicles.find((v) => v.id === targetVehicleId);
      if (!targetVehicle) return;

      const startDateObj = new Date(simState.startDate);
      const breakdownParams = calculateBreakdownParameters(
        type,
        simState.simMinutes,
        startDateObj,
        reason
      );

      const timeStr = formatSimulatedTime(startDateObj, simState.simMinutes);

      const breakdownInfo: BreakdownInfo = {
        type,
        typeName: breakdownParams.typeName,
        reason: breakdownParams.reason,
        startMinute: simState.simMinutes,
        locationAtBreakdown: { ...targetVehicle.position },
        maxSiteStayMinutes: breakdownParams.maxSiteStayMinutes,
        towedToCentral: false,
        returnToOperationMinute: breakdownParams.returnToOperationMinute,
        returnShiftDescription: breakdownParams.returnShiftDescription,
      };

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === targetVehicleId
            ? {
                ...v,
                status: 'broken',
                breakdownType: type,
                breakdownInfo,
                breakdownReason: breakdownParams.reason,
              }
            : v
        )
      );

      const availableVehicles = vehicles.filter(
        (v) => v.id !== targetVehicleId && v.status !== 'broken'
      );
      const backupVehicle = availableVehicles[0];

      if (backupVehicle) {
        setOrders((prev) =>
          prev.map((o) =>
            o.assignedVehicleId === targetVehicleId
              ? {
                  ...o,
                  assignedVehicleId: backupVehicle.id,
                  status: o.status === 'delayed' || (o.status as string) === 'collapsed' ? 'delayed' : 'at_risk',
                  urgency: 'priority',
                }
              : o
          )
        );
      }

      const newAlert: AlertItem = {
        id: `alt-breakdown-${Date.now()}`,
        type: 'breakdown',
        breakdownType: type,
        title: `${breakdownParams.typeName}: ${targetVehicle.code} (${targetVehicle.type.toUpperCase()})`,
        description: `${breakdownParams.reason}. ${
          type === 1
            ? 'Reparación in situ en 2h.'
            : 'Permanece máx 4h en sitio; traslado a Almacén Central.'
        } ${backupVehicle ? 'Paquetes reasignados dinámicamente.' : 'Sin unidad de trasvase inmediata.'}`,
        urgency: type === 3 ? 'critical' : type === 2 ? 'high' : 'medium',
        timestamp: timeStr,
        simMinute: simState.simMinutes,
        location: targetVehicle.position,
        relatedVehicleId: targetVehicle.id,
      };

      triggerAlertWithToast(newAlert);
    },
    [vehicles, simState.simMinutes, simState.startDate, triggerAlertWithToast]
  );

  // Reset alerts and failures logic
  const handleResetAlertsAndFailures = useCallback(() => {
    setAlerts([]);
    setToasts([]);
    setVehicles((prev) =>
      prev.map((v) => ({
        ...v,
        status: v.status === 'broken' ? 'idle' : v.status,
        breakdownReason: undefined,
        breakdownType: undefined,
        breakdownInfo: undefined,
      }))
    );

    setOrders((prev) =>
      prev.map((o) =>
        o.status === 'delayed' || (o.status as string) === 'collapsed'
          ? {
              ...o,
              status: 'on_time',
              deadlineMinute: Math.max(o.deadlineMinute, simState.simMinutes + 120),
            }
          : o
      )
    );

    setSimState((prev) => ({
      ...prev,
      collapseScore: 12,
      isCollapsed: false,
      collapseCause: undefined,
      timeToCollapseEstHours: 12,
    }));
  }, [simState.simMinutes]);

  // Timeline scrubber
  const handleSeekSimMinutes = useCallback(
    (newMinutes: number) => {
      const clampedMinutes = Math.max(0, Math.min(5 * 24 * 60, newMinutes));
      const startDateObj = new Date(simState.startDate);
      const targetDate = new Date(startDateObj.getTime() + clampedMinutes * 60 * 1000);
      const { shift: newShift } = getShiftFromDate(targetDate);
      const newDay = Math.min(5, Math.floor(clampedMinutes / (24 * 60)) + 1);

      setSimState((prev) => ({
        ...prev,
        simMinutes: clampedMinutes,
        day: newDay,
        shift: newShift,
      }));
    },
    [simState.startDate]
  );

  const handleSaveConfig = useCallback((updated: SystemConfig) => {
    setConfig(updated);
    if (updated.warehouseCapacities) {
      setWarehouses((prev) =>
        prev.map((w) => {
          if (w.id === 'northwest') {
            const cap = updated.warehouseCapacities.northwest;
            return { ...w, capacity: cap, currentStock: cap };
          }
          if (w.id === 'east') {
            const cap = updated.warehouseCapacities.east;
            return { ...w, capacity: cap, currentStock: cap };
          }
          return w;
        })
      );
    }
    if (updated.fleetSpeeds) {
      setVehicles((prev) =>
        prev.map((v) => ({
          ...v,
          speed:
            v.type === 'car'
              ? updated.fleetSpeeds.car
              : v.type === 'motorcycle'
              ? updated.fleetSpeeds.motorcycle
              : updated.fleetSpeeds.bicycle,
        }))
      );
    }
  }, []);

  // Main Simulation step loop
  useEffect(() => {
    if (!simState.isRunning) return;

    const intervalMs = Math.max(80, 1000 / simState.speedMultiplier);

    const timer = setInterval(() => {
      const {
        simState: currSim,
        vehicles: currVehicles,
        orders: currOrders,
        warehouses: currWarehouses,
        blockedStreets: currBlocks,
      } = stateRef.current;

      const deltaMinutes = 1 * (currSim.speedMultiplier >= 10 ? 2 : 1);
      const nextSimMinutes = currSim.simMinutes + deltaMinutes;

      const startDateObj = new Date(currSim.startDate);
      const currentSimDate = new Date(startDateObj.getTime() + nextSimMinutes * 60 * 1000);
      const minutesInDay = 24 * 60;
      const currentDay = Math.min(5, Math.floor(nextSimMinutes / minutesInDay) + 1);
      const { shift: currentShift } = getShiftFromDate(currentSimDate);

      // Reabastecer almacenes al 100% de capacidad únicamente cuando llega la medianoche (00:00)
      const prevSimDate = new Date(startDateObj.getTime() + currSim.simMinutes * 60 * 1000);
      const isMidnightPassed = prevSimDate.getDate() !== currentSimDate.getDate();

      if (isMidnightPassed) {
        setWarehouses((prev) =>
          prev.map((w) => ({
            ...w,
            currentStock: Number.isFinite(w.capacity) ? w.capacity : w.currentStock,
          }))
        );
      }

      const newlyTowedVehicleIds: string[] = [];
      const newlyMaintenanceVehicleIds: string[] = [];

      const simYear = currentSimDate.getFullYear();
      const simMonth = String(currentSimDate.getMonth() + 1).padStart(2, '0');
      const simDay = String(currentSimDate.getDate()).padStart(2, '0');
      const currentSimDateKey = `${simYear}${simMonth}${simDay}`;

      const currMaintenance = stateRef.current.maintenanceRecords;
      const scheduledCodesToday = new Set(
        currMaintenance
          .filter((m) => m.dateKey === currentSimDateKey)
          .map((m) => m.vehicleCode)
      );

      const centralPos = currWarehouses.find((w) => w.id === 'central')?.coords || { x: 27, y: 14 };

      const updatedVehicles = currVehicles.map((v) => {
        if (v.status === 'broken') {
          if (v.breakdownInfo) {
            const info = v.breakdownInfo;
            if (nextSimMinutes >= info.returnToOperationMinute) {
              return {
                ...v,
                status: 'idle' as const,
                breakdownType: undefined,
                breakdownInfo: undefined,
                breakdownReason: undefined,
                position: info.towedToCentral ? centralPos : v.position,
                destination: undefined,
                plannedPath: [],
              };
            }

            if ((info.type === 2 || info.type === 3) && !info.towedToCentral) {
              if (nextSimMinutes >= info.startMinute + info.maxSiteStayMinutes) {
                newlyTowedVehicleIds.push(v.id);
                return {
                  ...v,
                  position: centralPos,
                  breakdownInfo: {
                    ...info,
                    towedToCentral: true,
                    towedMinute: nextSimMinutes,
                  },
                };
              }
            }
          }
          return v;
        }

        const isScheduledToday = scheduledCodesToday.has(v.code);

        if (isScheduledToday) {
          if (v.status === 'en_route' || v.status === 'delivering') {
            newlyMaintenanceVehicleIds.push(v.id);
            return {
              ...v,
              status: 'maintenance' as const,
              maintenanceReason: 'Mantenimiento preventivo programado de 00:00 a 23:59. Retorno inmediato a base.',
              position: centralPos,
              destination: undefined,
              plannedPath: [],
              currentLoad: 0,
            };
          }

          if (v.status === 'idle') {
            return {
              ...v,
              status: 'maintenance' as const,
              maintenanceReason: 'Mantenimiento preventivo programado de 00:00 a 23:59. No disponible para rutas.',
              destination: undefined,
              plannedPath: [],
            };
          }

          if (v.status === 'maintenance') {
            return v;
          }
        } else {
          if (v.status === 'maintenance') {
            return {
              ...v,
              status: 'idle' as const,
              maintenanceReason: undefined,
            };
          }
        }

        if (!v.plannedPath || v.plannedPath.length === 0) {
          const newDest = getRandomGridPoint();
          const newPath = generateManhattanPath(v.position, newDest, currBlocks);
          return {
            ...v,
            destination: newDest,
            plannedPath: newPath.slice(1),
            totalDelivered: v.totalDelivered + 1,
            currentLoad: Math.max(0, v.currentLoad - 1),
            status: 'en_route' as const,
          };
        }

        const stepDistance = (v.speed / 60) * 0.16;
        const target = v.plannedPath[0];

        let nextX = v.position.x;
        let nextY = v.position.y;
        let nextPlannedPath = v.plannedPath;

        const dx = target.x - v.position.x;
        const dy = target.y - v.position.y;

        // Si ya llegó al nodo objetivo con tolerancia mínima
        if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) {
          nextX = target.x;
          nextY = target.y;
          nextPlannedPath = v.plannedPath.slice(1);
        } else if (Math.abs(dx) > 0.02) {
          // Movimiento estrictamente horizontal a lo largo de la calle (Y no cambia hasta girar)
          nextY = v.position.y;
          if (Math.abs(dx) <= stepDistance) {
            nextX = target.x;
            if (Math.abs(dy) < 0.02) {
              nextPlannedPath = v.plannedPath.slice(1);
            }
          } else {
            nextX = Math.round((v.position.x + Math.sign(dx) * stepDistance) * 1000) / 1000;
          }
        } else {
          // Movimiento estrictamente vertical a lo largo de la calle (X alineado a la calle vertical)
          nextX = target.x;
          if (Math.abs(dy) <= stepDistance) {
            nextY = target.y;
            nextPlannedPath = v.plannedPath.slice(1);
          } else {
            nextY = Math.round((v.position.y + Math.sign(dy) * stepDistance) * 1000) / 1000;
          }
        }

        return {
          ...v,
          position: {
            x: nextX,
            y: nextY,
          },
          plannedPath: nextPlannedPath,
        };
      });

      let firstDelayedOrder: Order | null = null;
      const centralWarehouse = currWarehouses.find((w) => !Number.isFinite(w.capacity)) || currWarehouses[0];
      const centralWarehouseId = centralWarehouse ? centralWarehouse.id : 'central';

      const updatedOrders = currOrders.map((o) => {
        if (
          ((newlyTowedVehicleIds.length > 0 &&
            o.assignedVehicleId &&
            newlyTowedVehicleIds.includes(o.assignedVehicleId)) ||
          (newlyMaintenanceVehicleIds.length > 0 &&
            o.assignedVehicleId &&
            newlyMaintenanceVehicleIds.includes(o.assignedVehicleId))) &&
          o.status !== 'delivered'
        ) {
          return {
            ...o,
            warehouseOriginId: centralWarehouseId,
            assignedVehicleId: undefined,
            status: 'at_risk' as const,
          };
        }

        if (o.status === 'delivered') return o;
        if (nextSimMinutes > o.deadlineMinute) {
          const delayedOrder = { ...o, status: 'delayed' as const };
          if (!firstDelayedOrder) firstDelayedOrder = delayedOrder;
          return delayedOrder;
        }
        if (nextSimMinutes > o.deadlineMinute - 30) {
          return { ...o, status: 'at_risk' as const };
        }
        return { ...o, status: 'on_time' as const };
      });

      if (newlyMaintenanceVehicleIds.length > 0) {
        const maintCodes = currVehicles
          .filter((veh) => newlyMaintenanceVehicleIds.includes(veh.id))
          .map((veh) => veh.code)
          .join(', ');

        triggerAlertWithToast({
          id: `maint-trigger-${nextSimMinutes}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'sla_warning',
          title: 'Mantenimiento Preventivo (00:00)',
          description: `Unidades ${maintCodes} retornaron de inmediato a base al iniciar mantenimiento preventivo. Pedidos no entregados devueltos a almacén para replanificación.`,
          urgency: 'high',
          timestamp: formatSimulatedTime(startDateObj, nextSimMinutes),
          simMinute: nextSimMinutes,
        });
      }

      const atRiskCount = updatedOrders.filter((o) => o.status === 'at_risk').length;
      const delayedCount = updatedOrders.filter(
        (o) => o.status === 'delayed' || (o.status as string) === 'collapsed'
      ).length;
      const brokenCount = updatedVehicles.filter((v) => v.status === 'broken').length;

      const finiteWarehouses = currWarehouses.filter((w) => Number.isFinite(w.capacity));
      const avgStockPct =
        finiteWarehouses.length > 0
          ? finiteWarehouses.reduce((sum, w) => sum + w.currentStock / w.capacity, 0) /
            finiteWarehouses.length
          : 0.35;

      const baseScore = avgStockPct * 45 + (atRiskCount / currOrders.length) * 35 + (delayedCount * 10);
      const fleetPenalty = (brokenCount / updatedVehicles.length) * 25;
      const stressMultiplier = currSim.scenario === 'collapse' ? 1.4 : 1.0;
      const calculatedCollapseScore = Math.min(
        100,
        Math.max(12, Math.round((baseScore + fleetPenalty) * stressMultiplier))
      );

      const ttlHours = Math.max(
        0.3,
        Math.round((((100 - calculatedCollapseScore) / 4.8)) * 10) / 10
      );

      const hasSimEndedByDelay = delayedCount > 0;
      const isFiveDaysCompleted = currSim.scenario === 'five_days' && nextSimMinutes >= 5 * 24 * 60;
      const isNowCollapsed = calculatedCollapseScore >= 96 || hasSimEndedByDelay;

      if (hasSimEndedByDelay && currSim.isRunning) {
        if (firstDelayedOrder) {
          setDelayedOrderForModal(firstDelayedOrder);
          setIsDelayModalOpen(true);
        }
        handleResetAlertsAndFailures();
      } else if (isFiveDaysCompleted && currSim.isRunning) {
        const timeStr = formatSimulatedTime(startDateObj, nextSimMinutes);
        const completeAlert: AlertItem = {
          id: `alt-5days-end-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'collapse_warning',
          title: 'Simulación de 5 Días Concluida',
          description: 'Se ha alcanzado la fecha límite de finalización (5 días de operación continua).',
          urgency: 'low',
          timestamp: timeStr,
          simMinute: nextSimMinutes,
        };
        triggerAlertWithToast(completeAlert);
      }

      setVehicles(updatedVehicles);
      setOrders(updatedOrders);
      setSimState((prev) => ({
        ...prev,
        isRunning: (hasSimEndedByDelay || isFiveDaysCompleted) ? false : prev.isRunning,
        simMinutes: nextSimMinutes,
        day: currentDay,
        shift: currentShift,
        collapseScore: hasSimEndedByDelay ? 100 : calculatedCollapseScore,
        timeToCollapseEstHours: hasSimEndedByDelay ? 0 : ttlHours,
        isCollapsed: isNowCollapsed,
        collapseCause: hasSimEndedByDelay
          ? `Fin de simulación: El pedido ${firstDelayedOrder?.code} ha quedado retrasado (SLA vencido). La simulación concluye de inmediato.`
          : isNowCollapsed
          ? 'Saturación crítica de almacenes y acumulación de pedidos en riesgo.'
          : undefined,
      }));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [simState.isRunning, simState.speedMultiplier, handleResetAlertsAndFailures, triggerAlertWithToast]);

  const handleApplyBlockages = useCallback(
    (newBlockages: BlockedStreet[]) => {
      setBlockedStreets(newBlockages);
      triggerAlertWithToast({
        id: `blockage-load-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sla_warning',
        title: 'Bloqueos Actualizados (1INF54)',
        description: `Se han cargado ${newBlockages.length} tramos bloqueados planificados desde archivo (polígonos abiertos).`,
        urgency: 'medium',
        timestamp: formatSimulatedTime(new Date(simState.startDate), simState.simMinutes),
        simMinute: simState.simMinutes,
      });
    },
    [simState.startDate, simState.simMinutes, triggerAlertWithToast]
  );

  const handleApplyOrders = useCallback(
    (newOrders: Order[]) => {
      setOrders(newOrders);
      triggerAlertWithToast({
        id: `orders-load-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sla_warning',
        title: 'Plan de Ventas y Envíos Cargado',
        description: `Se han importado ${newOrders.length} pedidos con SLA, cantidad y cliente asignados al almacén más cercano.`,
        urgency: 'low',
        timestamp: formatSimulatedTime(new Date(simState.startDate), simState.simMinutes),
        simMinute: simState.simMinutes,
      });
    },
    [simState.startDate, simState.simMinutes, triggerAlertWithToast]
  );

  const handleApplyMaintenance = useCallback(
    (records: PreventiveMaintenanceRecord[]) => {
      setMaintenanceRecords(records);
      triggerAlertWithToast({
        id: `maint-load-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sla_warning',
        title: 'Mantenimiento Preventivo Actualizado (1INF54)',
        description: `Se han configurado ${records.length} registros de mantenimiento preventivo. Las unidades se mantendrán fuera de servicio de 00:00 a 23:59 en su día programado.`,
        urgency: 'medium',
        timestamp: formatSimulatedTime(new Date(simState.startDate), simState.simMinutes),
        simMinute: simState.simMinutes,
      });
    },
    [simState.startDate, simState.simMinutes, triggerAlertWithToast]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LiveAnnouncer>
          <div
            id="app-root-container"
            className="flex h-screen w-screen overflow-hidden bg-[#061124] text-slate-100"
          >
            {/* 1. SIDEBAR IZQUIERDO: Estilo exacto como image.png */}
            <SidebarLeft
              currentScenario={simState.scenario}
              onSelectScenario={handleSelectScenario}
              isCollapsed={isLeftCollapsed}
              onToggleCollapse={() => setIsLeftCollapsed(!isLeftCollapsed)}
              onOpenConfig={() => setIsConfigModalOpen(true)}
              onOpenDataFilesTab={() => setIsDataFilesModalOpen(true)}
              activeVehiclesCount={vehicles.filter((v) => v.status !== 'broken').length}
              totalAlertsCount={alerts.length}
              isDarkTheme={true}
            />

            {/* 2. MAPA CENTRAL MANHATTAN (Dominante) */}
            <div className="flex-1 relative h-full overflow-hidden bg-[var(--color-background)]">
              <CentralMap
                warehouses={warehouses}
                vehicles={vehicles}
                blockedStreets={blockedStreets}
                orders={orders}
                selectedVehicleId={selectedVehicleId}
                onSelectVehicle={(veh) => setSelectedVehicleId(veh ? veh.id : undefined)}
                selectedWarehouseId={selectedWarehouseId}
                onSelectWarehouse={(wh) => setSelectedWarehouseId(wh ? wh.id : undefined)}
                onCreateBreakdownForVehicle={(vehId) => {
                  setSelectedVehicleId(vehId);
                  setIsBreakdownModalOpen(true);
                }}
                showProjectedRoutes={config.showProjectedRoutes}
                onToggleProjectedRoutes={() =>
                  setConfig((prev) => ({ ...prev, showProjectedRoutes: !prev.showProjectedRoutes }))
                }
                showBlockedStreets={config.showBlockedStreets}
                onToggleBlockedStreets={() =>
                  setConfig((prev) => ({ ...prev, showBlockedStreets: !prev.showBlockedStreets }))
                }
                showCoverageZones={config.showCoverageZones}
                onToggleCoverageZones={() =>
                  setConfig((prev) => ({ ...prev, showCoverageZones: !prev.showCoverageZones }))
                }
                isDarkTheme={false}
                config={config}
                simMinutes={simState.simMinutes}
              />
            </div>

            {/* 3. SIDEBAR DERECHO: Como antes de cambiar el diseño (Reloj, Almacenes, Semáforo, Alertas) */}
            <SidebarRight
              scenario={simState.scenario}
              simState={simState}
              onTogglePlayPause={handleTogglePlayPause}
              onResetSimulation={handleResetSimulation}
              onChangeSpeed={handleChangeSpeed}
              onStartDateChange={handleStartDateChange}
              onSeekSimMinutes={handleSeekSimMinutes}
              warehouses={warehouses}
              vehicles={vehicles}
              orders={orders}
              alerts={alerts}
              onOpenCreateBreakdown={() => setIsBreakdownModalOpen(true)}
              isCollapsed={isRightCollapsed}
              onToggleCollapse={() => setIsRightCollapsed(!isRightCollapsed)}
              config={config}
              onChangeConfig={(partial) => setConfig((prev) => ({ ...prev, ...partial }))}
              onOpenFullConfigModal={() => setIsConfigModalOpen(true)}
              onSelectVehicleById={(vId) => setSelectedVehicleId(vId)}
              isDarkTheme={true}
              onOpenDataFilesModal={() => setIsDataFilesModalOpen(true)}
              blockedStreetsCount={blockedStreets.length}
              totalOrdersCount={orders.length}
              onApplyBlockages={handleApplyBlockages}
              onApplyOrders={handleApplyOrders}
              onApplyMaintenance={handleApplyMaintenance}
              activeSidebarTab={rightSidebarTab}
              onTabChange={setRightSidebarTab}
            />

            {/* Modal: Crear Avería */}
            <BreakdownModal
              isOpen={isBreakdownModalOpen}
              onClose={() => setIsBreakdownModalOpen(false)}
              vehicles={vehicles}
              onConfirmBreakdown={handleCreateBreakdown}
              isDarkTheme={true}
            />

            {/* Modal: Popup de Retraso Crítico */}
            <DelayAlertModal
              isOpen={isDelayModalOpen}
              onClose={() => setIsDelayModalOpen(false)}
              order={delayedOrderForModal}
              simTime={formatSimulatedTime(new Date(simState.startDate), simState.simMinutes)}
              simMinute={simState.simMinutes}
              warehouses={warehouses}
              vehicles={vehicles}
              onResetAlertsAndFailures={handleResetAlertsAndFailures}
              isDarkTheme={true}
            />

            {/* Modal: Configuración Completa del Sistema VRP */}
            <ConfigModal
              isOpen={isConfigModalOpen}
              onClose={() => setIsConfigModalOpen(false)}
              config={config}
              onSaveConfig={handleSaveConfig}
              isDarkTheme={true}
              isSimRunning={simState.isRunning}
              onPauseSim={handleTogglePlayPause}
            />

            {/* Modal: Carga de Archivos de Bloqueos, Pedidos y Mantenimiento */}
            <DataFilesModal
              isOpen={isDataFilesModalOpen}
              onClose={() => setIsDataFilesModalOpen(false)}
              warehouses={warehouses}
              currentBlockedCount={blockedStreets.length}
              currentOrdersCount={orders.length}
              onApplyBlockages={handleApplyBlockages}
              onApplyOrders={handleApplyOrders}
              onApplyMaintenance={handleApplyMaintenance}
              isDarkTheme={true}
            />

            {/* Notificaciones Toast en Esquina Superior Derecha */}
            <ToastContainer
              toasts={toasts}
              onDismiss={handleDismissToast}
              onSelectVehicle={(vId) => setSelectedVehicleId(vId)}
              isDarkTheme={true}
            />
          </div>
        </LiveAnnouncer>
      </ToastProvider>
    </QueryClientProvider>
  );
}
