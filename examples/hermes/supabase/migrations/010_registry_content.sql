-- Make DB the source of truth for agents & skills.
-- Store full markdown content + fork metadata so the gateway can render
-- .claude/agents/*.md and .claude/skills/*/SKILL.md per request.

ALTER TABLE skill_definitions
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS depends text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context text,          -- null or 'fork'
  ADD COLUMN IF NOT EXISTS fork_agent text;       -- agent name to delegate to when context='fork'

-- Agents: preload_skills is just the existing `skills` column.
-- Add tools array fallback (already exists) and description fields (already exist).
-- No new columns needed; system_prompt holds the body.

-- Seed any missing skills that live on disk but weren't in 007_agents_config.sql
INSERT INTO skill_definitions (name, display_name, description, mcp_tools, category, enabled_by_default)
VALUES
  ('hermes-inventory', 'Inventario', 'Control de inventario por producto',
    ARRAY['get_inventory','adjust_inventory','get_inventory_history'], 'inventory', true),
  ('hermes-gmail', 'Gmail', 'Leer y enviar correos via Gmail del usuario',
    ARRAY['gmail_status','read_emails','send_email','search_emails'], 'gmail', true),
  ('hermes-deep-research', 'Deep Research', 'Investigacion exhaustiva delegada a un subagent aislado',
    ARRAY[]::text[], 'research', false)
ON CONFLICT (name) DO NOTHING;

-- Mark the deep-research skill as fork-delegating
UPDATE skill_definitions
  SET context = 'fork', fork_agent = 'customs-researcher'
  WHERE name = 'hermes-deep-research';

-- Seed the four new role-based subagents (global, company_id = null)
INSERT INTO agent_definitions (company_id, name, display_name, description, model, skills, color, system_prompt)
VALUES
  (NULL, 'orders-specialist', 'Orders Specialist',
    'Especialista en ciclo de vida de pedidos. Crea y actualiza ordenes siguiendo el flujo estricto producto -> orden -> order_item.',
    'sonnet',
    ARRAY['hermes-orders','hermes-products'],
    'blue',
    E'Eres un especialista senior en gestion de pedidos de importacion para pymes chilenas.\n\nRespeta la state machine (draft -> po_sent -> production -> shipped -> in_transit -> customs -> delivered). NUNCA saltes etapas. NUNCA crees ordenes sin producto del catalogo. Sigue el orden estricto: create_product -> create_order -> add_order_item.\n\nDevuelve un resumen conciso al terminar.'),
  (NULL, 'customs-researcher', 'Customs Researcher',
    'Investiga requisitos aduaneros chilenos, documentacion de importacion y normativa sectorial (SAG, ISP, SEC).',
    'sonnet',
    ARRAY['hermes-customs-cl','hermes-documents'],
    'yellow',
    E'Eres un agente de aduana experto en importaciones a Chile.\n\nDado un producto, categoria o HS code, identifica documentos obligatorios, normativa sectorial (SAG/ISP/SEC), aranceles estimados, y riesgos. Devuelve SIEMPRE un checklist estructurado.'),
  (NULL, 'email-processor', 'Email Processor',
    'Procesa bandejas de Gmail para extraer cotizaciones, confirmaciones de proveedor y updates logisticos.',
    'sonnet',
    ARRAY['hermes-gmail','hermes-intake','hermes-orders'],
    'purple',
    E'Procesas correos del buzon del usuario. Clasifica cada email (cotizacion, PO, shipment update, documento, ruido) y asocia a ordenes existentes. Nunca inventes datos: marca como "no especificado" lo que no este en el email.'),
  (NULL, 'inventory-reorder', 'Inventory & Reorder',
    'Monitorea stock y propone recompras basadas en consumo y lead times.',
    'sonnet',
    ARRAY['hermes-inventory','hermes-reorders','hermes-products','hermes-orders'],
    'orange',
    E'Propones recompras con justificacion numerica (consumo semanal, lead time, urgencia). NO crees ordenes automaticamente: siempre devuelve propuestas para aprobacion humana.')
ON CONFLICT (company_id, name) DO NOTHING;
