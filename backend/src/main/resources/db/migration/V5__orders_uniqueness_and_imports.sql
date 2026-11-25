-- Registro de cada carga de archivo (oficial del seeder o manual por API) y unicidad de pedidos
-- compatible con el borrado lógico y con dos fuentes.

CREATE TABLE data_imports (
    id UUID PRIMARY KEY,
    source VARCHAR(16) NOT NULL,
    file_type VARCHAR(16) NOT NULL,
    file_name VARCHAR(128) NOT NULL,
    period_year INTEGER,
    period_month INTEGER,
    sha256 CHAR(64) NOT NULL,
    row_count INTEGER NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_data_imports_source CHECK (source IN ('OFFICIAL', 'MANUAL'))
);

-- El seeder busca "¿ya se cargó este archivo con este contenido?" en cada arranque.
CREATE INDEX idx_data_imports_lookup ON data_imports (source, file_name, sha256) WHERE deleted_at IS NULL;

ALTER TABLE orders ADD COLUMN import_id UUID REFERENCES data_imports(id) ON DELETE RESTRICT;
ALTER TABLE street_blockages ADD COLUMN import_id UUID REFERENCES data_imports(id) ON DELETE RESTRICT;
ALTER TABLE maintenance_schedules ADD COLUMN import_id UUID REFERENCES data_imports(id) ON DELETE RESTRICT;

CREATE INDEX idx_orders_import_id ON orders (import_id);
CREATE INDEX idx_street_blockages_import_id ON street_blockages (import_id);
CREATE INDEX idx_maintenance_schedules_import_id ON maintenance_schedules (import_id);

-- Antes: order_code único global, incluidas filas borradas lógicamente y de la otra fuente, así
-- que un pedido manual con el mismo código que uno oficial (o que uno manual ya limpiado) se
-- descartaba en silencio por ON CONFLICT DO NOTHING.
ALTER TABLE orders DROP CONSTRAINT orders_order_code_key;
CREATE UNIQUE INDEX ux_orders_source_code_active ON orders (source, order_code) WHERE deleted_at IS NULL;
