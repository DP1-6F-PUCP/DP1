-- Valores oficiales del caso PaqRap: perfil inmutable y única fuente de verdad para
-- "Restaurar valores oficiales" (antes estaban copiados en el frontend). La configuración VIGENTE
-- sigue en city_configs / operation_configs / vehicle_types / warehouses / vehicles.

CREATE TABLE official_master_config (
    id SMALLINT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_official_master_config_singleton CHECK (id = 1)
);

INSERT INTO official_master_config (id, payload) VALUES (1, '{
  "tipos": {
    "AUTO": {"velocidad": 40, "capacidad": 24, "cantidad": 10},
    "MOTO": {"velocidad": 25, "capacidad": 8, "cantidad": 15},
    "BICI": {"velocidad": 12, "capacidad": 4, "cantidad": 12}
  },
  "almacenes": {
    "Central": {"x": 27, "y": 14},
    "Nor-Oeste": {"x": 12, "y": 38, "capacidad": 1000, "frecuencia": 24},
    "Este": {"x": 57, "y": 27, "capacidad": 1000, "frecuencia": 24}
  },
  "operacion": {
    "duracionTurnoHoras": 8,
    "horaInicioTurno": 7,
    "tiempoServicioClienteHoras": 1,
    "duracionRefrigerioHoras": 1,
    "margenRefrigerioHoras": 1,
    "tiempoCargaAlmacenHoras": 0,
    "tiempoTrasvaseHoras": 0.5,
    "maxParadasPorRuta": 2
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;
