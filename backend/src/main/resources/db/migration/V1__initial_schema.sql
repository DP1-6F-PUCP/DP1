-- Esquema inicial de PaqRap (Estándar 63.std.db.v01.pdf)
-- Tablas en snake_case plural, PK UUID, timestamps en timestamptz, soft deletes con deleted_at.

CREATE TABLE city_configs (
    id UUID PRIMARY KEY,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    origin_x INTEGER NOT NULL,
    origin_y INTEGER NOT NULL,
    node_distance_km INTEGER NOT NULL,
    two_way_streets BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE operation_configs (
    id UUID PRIMARY KEY,
    shift_duration_hours NUMERIC(8, 2) NOT NULL,
    shift_start_hour NUMERIC(8, 2) NOT NULL,
    client_service_hours NUMERIC(8, 2) NOT NULL,
    break_duration_hours NUMERIC(8, 2) NOT NULL,
    break_margin_hours NUMERIC(8, 2) NOT NULL,
    warehouse_load_hours NUMERIC(8, 2) NOT NULL,
    transshipment_hours NUMERIC(8, 2) NOT NULL,
    max_stops_per_route INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicle_types (
    id UUID PRIMARY KEY,
    type_code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    capacity INTEGER NOT NULL,
    speed_kmh NUMERIC(8, 2) NOT NULL,
    cost_per_km NUMERIC(10, 2) NOT NULL,
    initial_units INTEGER NOT NULL,
    maintenance_duration_hours NUMERIC(8, 2) NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    warehouse_type VARCHAR(32) NOT NULL,
    pos_x INTEGER NOT NULL,
    pos_y INTEGER NOT NULL,
    max_capacity INTEGER NOT NULL,
    reload_frequency_hours NUMERIC(8, 2) NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE vehicles (
    id UUID PRIMARY KEY,
    vehicle_code VARCHAR(32) NOT NULL UNIQUE,
    vehicle_type_id UUID NOT NULL,
    initial_pos_x INTEGER NOT NULL,
    initial_pos_y INTEGER NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_vehicles_vehicle_type
        FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_vehicles_vehicle_type_id ON vehicles (vehicle_type_id);

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    order_code VARCHAR(64) NOT NULL UNIQUE,
    client_code VARCHAR(64) NOT NULL,
    dest_x INTEGER NOT NULL,
    dest_y INTEGER NOT NULL,
    requested_quantity INTEGER NOT NULL,
    sla_hours INTEGER NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    source VARCHAR(16) NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_period_registered ON orders (period_year, period_month, registered_at);
CREATE INDEX idx_orders_source_deleted ON orders (source, deleted_at);

CREATE TABLE street_blockages (
    id UUID PRIMARY KEY,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    nodes_json JSONB NOT NULL,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    source VARCHAR(16) NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_street_blockages_period ON street_blockages (period_year, period_month);
CREATE INDEX idx_street_blockages_source_deleted ON street_blockages (source, deleted_at);

CREATE TABLE maintenance_schedules (
    id UUID PRIMARY KEY,
    vehicle_code VARCHAR(32) NOT NULL,
    scheduled_date DATE NOT NULL,
    template_month INTEGER NOT NULL,
    template_day INTEGER NOT NULL,
    source VARCHAR(16) NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_maintenance_schedules_source_deleted ON maintenance_schedules (source, deleted_at);

CREATE TABLE scenario_executions (
    id UUID PRIMARY KEY,
    scenario_type VARCHAR(32) NOT NULL,
    status VARCHAR(48) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    simulated_start_at TIMESTAMPTZ NOT NULL,
    simulated_end_at TIMESTAMPTZ,
    sa NUMERIC(10, 4) NOT NULL,
    k NUMERIC(10, 4) NOT NULL,
    stop_reason VARCHAR(32),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_scenario_executions_status ON scenario_executions (status);

CREATE TABLE simulation_reports (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL UNIQUE,
    report_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_simulation_reports_execution
        FOREIGN KEY (execution_id) REFERENCES scenario_executions(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_simulation_reports_execution_id ON simulation_reports (execution_id);
