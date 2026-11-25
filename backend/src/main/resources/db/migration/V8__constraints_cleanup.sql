-- Limpieza de esquema: índice redundante, dominios con CHECK y registro único de configuración.
-- Verificado antes de crearla (SELECT DISTINCT sobre la base real): todos los valores existentes
-- caben en estas listas.

-- simulation_reports.execution_id ya es UNIQUE (V1), que crea su propio índice.
DROP INDEX IF EXISTS idx_simulation_reports_execution_id;

ALTER TABLE orders ADD CONSTRAINT chk_orders_source CHECK (source IN ('OFFICIAL', 'MANUAL'));
ALTER TABLE street_blockages ADD CONSTRAINT chk_street_blockages_source CHECK (source IN ('OFFICIAL', 'MANUAL'));
ALTER TABLE maintenance_schedules ADD CONSTRAINT chk_maintenance_schedules_source CHECK (source IN ('OFFICIAL', 'MANUAL'));
ALTER TABLE warehouses ADD CONSTRAINT chk_warehouses_type CHECK (warehouse_type IN ('CENTRAL', 'INTERMEDIO'));
ALTER TABLE scenario_executions ADD CONSTRAINT chk_scenario_executions_status
    CHECK (status IN ('INICIADA', 'EN_CURSO', 'PAUSADA', 'FINALIZADA', 'DETENIDA_POR_INCUMPLIMIENTO', 'INTERRUMPIDA'));
ALTER TABLE scenario_executions ADD CONSTRAINT chk_scenario_executions_stop_reason
    CHECK (stop_reason IS NULL OR stop_reason IN ('COLAPSO', 'PERIODO_COMPLETADO', 'PARADA_MANUAL', 'REINICIO_SERVIDOR'));

-- Configuración vigente de ciudad y de operación: exactamente un registro.
CREATE UNIQUE INDEX ux_city_configs_singleton ON city_configs ((TRUE));
CREATE UNIQUE INDEX ux_operation_configs_singleton ON operation_configs ((TRUE));
