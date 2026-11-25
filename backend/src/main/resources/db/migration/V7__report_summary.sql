-- Columnas resumen del reporte final, consultables con SQL sin abrir el JSONB.

ALTER TABLE simulation_reports
    ADD COLUMN total_orders INTEGER,
    ADD COLUMN delivered_count INTEGER,
    ADD COLUMN late_count INTEGER,
    ADD COLUMN stop_reason VARCHAR(32),
    ADD COLUMN sim_duration_ms BIGINT;

CREATE INDEX idx_simulation_reports_created_at ON simulation_reports (created_at DESC);

-- Rellena los reportes ya guardados a partir de su payload.
UPDATE simulation_reports r
SET total_orders = COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(r.report_payload -> 'pedidosFinales') = 'array'
                                                    THEN r.report_payload -> 'pedidosFinales' END), 0),
    delivered_count = (SELECT COUNT(*) FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(r.report_payload -> 'pedidosFinales') = 'array'
                                THEN r.report_payload -> 'pedidosFinales' ELSE '[]'::jsonb END) e
                       WHERE e ->> 'estado' = 'ENTREGADA'),
    late_count = (SELECT COUNT(*) FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(r.report_payload -> 'pedidosFinales') = 'array'
                           THEN r.report_payload -> 'pedidosFinales' ELSE '[]'::jsonb END) e
                  WHERE e ->> 'estado' = 'INCUMPLIDA'),
    stop_reason = r.report_payload ->> 'motivoFinalizacion',
    sim_duration_ms = NULLIF(r.report_payload ->> 'duracionSimuladaMs', '')::BIGINT;
