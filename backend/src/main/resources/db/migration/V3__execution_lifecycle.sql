-- Ciclo de vida de una ejecución: foto de la configuración con que corrió, latido periódico para
-- saber hasta dónde llegó y detección de ejecuciones huérfanas tras un reinicio del backend.

ALTER TABLE scenario_executions
    ADD COLUMN ta NUMERIC(10, 4),
    ADD COLUMN algorithm VARCHAR(16),
    ADD COLUMN config_snapshot JSONB,
    ADD COLUMN last_heartbeat_at TIMESTAMPTZ,
    ADD COLUMN simulated_now_at TIMESTAMPTZ;

-- Listado de ejecuciones pasadas (GET /api/escenarios), de la más reciente a la más antigua.
CREATE INDEX idx_scenario_executions_started_at ON scenario_executions (started_at DESC);
