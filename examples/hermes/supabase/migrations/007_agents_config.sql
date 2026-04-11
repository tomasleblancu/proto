-- Agent definitions: configurable per company
CREATE TABLE agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies, -- null = global default
  name text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  model text DEFAULT 'sonnet',
  skills text[] DEFAULT '{}',
  tools text[] DEFAULT '{}',
  system_prompt text,
  enabled boolean DEFAULT true,
  color text DEFAULT 'green',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);

-- Skill definitions: metadata about available skills
CREATE TABLE skill_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  mcp_tools text[] DEFAULT '{}',
  category text, -- intake, orders, documents, reorders, customs, company, products
  enabled_by_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_defs_company ON agent_definitions(company_id);
CREATE INDEX idx_agent_defs_name ON agent_definitions(name);

-- RLS
ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages agent_definitions" ON agent_definitions FOR ALL
  USING (company_id IS NULL OR is_company_admin(company_id));

CREATE POLICY "Anyone reads skill_definitions" ON skill_definitions FOR SELECT
  USING (true);

CREATE POLICY "Admin manages skill_definitions" ON skill_definitions FOR ALL
  USING (true); -- global resource

-- Seed default skills
INSERT INTO skill_definitions (name, display_name, description, mcp_tools, category, enabled_by_default) VALUES
('hermes-company', 'Empresa', 'Gestion de empresas y onboarding', ARRAY['update_profile','create_company','list_companies','add_company_user'], 'company', true),
('hermes-products', 'Productos', 'Catalogo de productos', ARRAY['create_product','list_products','get_product','update_product','add_order_item','list_order_items'], 'products', true),
('hermes-intake', 'Intake', 'Recopilacion de info para nueva importacion', ARRAY['create_order','update_order_status','get_order','create_product','list_products','add_order_item'], 'intake', true),
('hermes-orders', 'Pedidos', 'Gestion de pedidos de importacion', ARRAY['create_order','update_order_status','get_order','list_orders','get_order_timeline','delete_order'], 'orders', true),
('hermes-documents', 'Documentos', 'Gestion documental', ARRAY['upload_document','list_documents','validate_document_set','get_document'], 'documents', true),
('hermes-reorders', 'Recompras', 'Automatizacion de recompras', ARRAY['create_reorder_rule','check_reorders','trigger_reorder','list_reorder_rules','send_alert'], 'reorders', true),
('hermes-customs-cl', 'Aduana Chile', 'Regulaciones aduaneras chilenas', ARRAY[]::text[], 'customs', true);

-- Seed default agents
INSERT INTO agent_definitions (company_id, name, display_name, description, model, skills, color, system_prompt) VALUES
(NULL, 'intake-agent', 'Intake', 'Recopila info del producto y crea fichas tecnicas. Usa proactivamente cuando el usuario quiere importar algo nuevo.', 'sonnet', ARRAY['hermes-company','hermes-products','hermes-intake'], 'cyan', 'Eres el agente de intake de Hermes. Tu trabajo es recopilar toda la informacion de un producto nuevo que el cliente quiere importar, crear la ficha tecnica en el catalogo, y registrar el pedido.'),
(NULL, 'order-manager', 'Pedidos', 'Gestiona pedidos, estados, documentos y timeline. Usa proactivamente para consultas de pedidos existentes.', 'sonnet', ARRAY['hermes-orders','hermes-documents','hermes-products'], 'blue', 'Eres el agente de gestion de pedidos de Hermes. Tu trabajo es gestionar el ciclo de vida de los pedidos: estados, documentos, timeline.'),
(NULL, 'sourcing-agent', 'Sourcing', 'Busca proveedores y cotiza productos. Usa cuando se necesita buscar opciones de proveedores.', 'sonnet', ARRAY['hermes-products','hermes-orders'], 'purple', 'Eres el agente de sourcing de Hermes. Tu trabajo es buscar proveedores, comparar opciones y presentar cotizaciones al cliente.'),
(NULL, 'reorder-agent', 'Recompras', 'Monitorea y ejecuta recompras automaticas. Usa para configurar o revisar reglas de recompra.', 'sonnet', ARRAY['hermes-reorders','hermes-products','hermes-orders'], 'orange', 'Eres el agente de recompras de Hermes. Tu trabajo es gestionar las reglas de recompra automatica y alertar cuando toca reordenar.'),
(NULL, 'customs-agent', 'Aduana', 'Valida documentos para aduana y asesora en tramites aduaneros chilenos.', 'sonnet', ARRAY['hermes-customs-cl','hermes-documents','hermes-orders'], 'yellow', 'Eres el agente de aduana de Hermes. Tu trabajo es validar documentos, asesorar en tramites aduaneros y asegurar que todo este en orden para la internacion.');
