-- Agrega campo `extracted` a documents para guardar el contenido
-- estructurado que el agente extrae al leer el archivo (montos, fechas,
-- items, etc). Evita re-leer el PDF/imagen en futuras interacciones.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted jsonb;

COMMENT ON COLUMN documents.extracted IS 'Contenido estructurado extraido del documento por el agente (montos, fechas, items, etc)';
