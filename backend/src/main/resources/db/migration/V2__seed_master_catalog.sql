-- Catálogo maestro inicial de PaqRap (idempotente)

INSERT INTO city_configs (id, width, height, origin_x, origin_y, node_distance_km, two_way_streets)
VALUES ('00000000-0000-0000-0000-000000000001', 70, 50, 0, 0, 1, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO operation_configs (
    id, shift_duration_hours, shift_start_hour, client_service_hours,
    break_duration_hours, break_margin_hours, warehouse_load_hours,
    transshipment_hours, max_stops_per_route
)
VALUES ('00000000-0000-0000-0000-000000000002', 8.00, 7.00, 1.00, 1.00, 1.00, 0.00, 0.50, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vehicle_types (id, type_code, name, capacity, speed_kmh, cost_per_km, initial_units, maintenance_duration_hours)
VALUES
    ('00000000-0000-0000-0000-000000000101', 'AUTO', 'Auto', 24, 40.00, 8.00, 10, 48.00),
    ('00000000-0000-0000-0000-000000000102', 'MOTO', 'Moto', 8, 25.00, 6.00, 15, 24.00),
    ('00000000-0000-0000-0000-000000000103', 'BICI', 'Bicicleta', 4, 12.00, 3.00, 12, 8.00)
ON CONFLICT (type_code) DO NOTHING;

INSERT INTO warehouses (id, name, warehouse_type, pos_x, pos_y, max_capacity, reload_frequency_hours)
VALUES
    ('00000000-0000-0000-0000-000000000201', 'Central', 'CENTRAL', 27, 14, 0, 0.00),
    ('00000000-0000-0000-0000-000000000202', 'Nor-Oeste', 'INTERMEDIO', 12, 38, 1000, 24.00),
    ('00000000-0000-0000-0000-000000000203', 'Este', 'INTERMEDIO', 57, 27, 1000, 24.00)
ON CONFLICT (name) DO NOTHING;

-- Flota inicial: 10 Autos (TA01..TA10), 15 Motos (TM01..TM15), 12 Bicicletas (TB01..TB12)
INSERT INTO vehicles (id, vehicle_code, vehicle_type_id, initial_pos_x, initial_pos_y)
SELECT
    ('00000000-0000-0000-0001-' || LPAD(n::TEXT, 12, '0'))::UUID,
    'TA' || LPAD(n::TEXT, 2, '0'),
    '00000000-0000-0000-0000-000000000101',
    27, 14
FROM generate_series(1, 10) AS n
ON CONFLICT (vehicle_code) DO NOTHING;

INSERT INTO vehicles (id, vehicle_code, vehicle_type_id, initial_pos_x, initial_pos_y)
SELECT
    ('00000000-0000-0000-0002-' || LPAD(n::TEXT, 12, '0'))::UUID,
    'TM' || LPAD(n::TEXT, 2, '0'),
    '00000000-0000-0000-0000-000000000102',
    27, 14
FROM generate_series(1, 15) AS n
ON CONFLICT (vehicle_code) DO NOTHING;

INSERT INTO vehicles (id, vehicle_code, vehicle_type_id, initial_pos_x, initial_pos_y)
SELECT
    ('00000000-0000-0000-0003-' || LPAD(n::TEXT, 12, '0'))::UUID,
    'TB' || LPAD(n::TEXT, 2, '0'),
    '00000000-0000-0000-0000-000000000103',
    27, 14
FROM generate_series(1, 12) AS n
ON CONFLICT (vehicle_code) DO NOTHING;
