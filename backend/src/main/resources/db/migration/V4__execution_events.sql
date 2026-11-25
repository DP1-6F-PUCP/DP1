-- Eventos de negocio de una ejecución (auditoría): averías inducidas y solicitudes de cambio.
-- Una fila por evento, nunca por cuadro de animación.

CREATE TABLE execution_breakdowns (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL,
    vehicle_code VARCHAR(32) NOT NULL,
    vehicle_type VARCHAR(32) NOT NULL,
    breakdown_type VARCHAR(16) NOT NULL,
    sim_start_at TIMESTAMPTZ NOT NULL,
    sim_end_est_at TIMESTAMPTZ,
    transfer_at TIMESTAMPTZ,
    pos_x INTEGER NOT NULL,
    pos_y INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_execution_breakdowns_execution
        FOREIGN KEY (execution_id) REFERENCES scenario_executions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_execution_breakdowns_execution ON execution_breakdowns (execution_id, sim_start_at);

CREATE TABLE execution_requests (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL,
    request_type VARCHAR(48) NOT NULL,
    target VARCHAR(64),
    old_value VARCHAR(128),
    new_value VARCHAR(128),
    sim_scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL,
    detail VARCHAR(255),
    applied_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_execution_requests_execution
        FOREIGN KEY (execution_id) REFERENCES scenario_executions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_execution_requests_status
        CHECK (status IN ('PROGRAMADA', 'APLICADA', 'RECHAZADA', 'DESCARTADA'))
);

CREATE INDEX idx_execution_requests_execution ON execution_requests (execution_id, sim_scheduled_at);
