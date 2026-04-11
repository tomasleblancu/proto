-- Hermes: Workflow / state machine schema
-- Introduce el state machine a nivel item, muestras, pagos, transiciones, y
-- enriquece documents/orders. Coexiste con el legacy `order_status` para
-- migracion gradual.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE phase AS ENUM (
  'sourcing','negotiation','preliminary_costing','forwarder_quotation',
  'final_costing','purchase_order','production','documentation','shipping',
  'customs_cl','last_mile','received','closed'
);

CREATE TYPE incoterm AS ENUM ('EXW','FOB','CIF','DDP');

CREATE TYPE doc_kind AS ENUM (
  'proforma_invoice','commercial_invoice','packing_list',
  'certificate_of_origin','form_f','bill_of_lading',
  'forwarder_invoice','customs_funds_provision','port_invoice',
  'din','msds','other'
);

CREATE TYPE sample_status AS ENUM (
  'requested','in_transit','received','under_evaluation',
  'approved','rejected','needs_revision','cancelled'
);

CREATE TYPE sample_shipping_method AS ENUM (
  'courier','with_main_shipment','hand_carry'
);

CREATE TYPE payment_type AS ENUM (
  'deposit','balance','freight','customs_provision','duties',
  'port','insurance','other'
);

CREATE TYPE payment_payee AS ENUM ('supplier','forwarder','customs','port','other');

CREATE TYPE payment_status AS ENUM ('pending','scheduled','paid','failed','cancelled');

-- ============================================================================
-- SUPPLIERS
-- ============================================================================

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  name text NOT NULL,
  country_code text,           -- ISO 3166-1 alpha-2, usado para detectar TLC
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_suppliers_company ON suppliers(company_id);

-- ============================================================================
-- ORDERS: extender con supplier_id, incoterm tipado, current_phase derivado
-- ============================================================================

ALTER TABLE orders ADD COLUMN supplier_id uuid REFERENCES suppliers;
ALTER TABLE orders ADD COLUMN incoterm_typed incoterm DEFAULT 'FOB';
ALTER TABLE orders ADD COLUMN current_phase phase;  -- derivado de items
ALTER TABLE orders ADD COLUMN country_origin text;  -- ISO alpha-2

CREATE INDEX idx_orders_supplier ON orders(supplier_id);
CREATE INDEX idx_orders_current_phase ON orders(current_phase);

-- ============================================================================
-- ORDER ITEMS (state machine vive aqui)
-- ============================================================================

-- order_items ya existe (migration 006). Extender con columnas del state machine.
ALTER TABLE order_items ADD COLUMN company_id uuid REFERENCES companies;
ALTER TABLE order_items ADD COLUMN sku text;
ALTER TABLE order_items ADD COLUMN description text;
ALTER TABLE order_items ADD COLUMN current_phase phase NOT NULL DEFAULT 'sourcing';
ALTER TABLE order_items ADD COLUMN current_step text NOT NULL DEFAULT 'identify_need';
ALTER TABLE order_items ADD COLUMN on_hold boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN blocked_reason text;
ALTER TABLE order_items ADD COLUMN cancelled boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE order_items ADD COLUMN updated_at timestamptz DEFAULT now();

-- product_id era NOT NULL; en sourcing puede no existir aun.
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

-- Backfill company_id desde orders para filas existentes.
UPDATE order_items oi SET company_id = o.company_id
  FROM orders o WHERE oi.order_id = o.id AND oi.company_id IS NULL;
ALTER TABLE order_items ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX idx_order_items_company ON order_items(company_id);
CREATE INDEX idx_order_items_phase ON order_items(current_phase);
CREATE INDEX idx_order_items_blocked ON order_items(blocked_reason) WHERE blocked_reason IS NOT NULL;

-- ============================================================================
-- SAMPLES (entidad first-class)
-- ============================================================================

CREATE TABLE samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  supplier_id uuid REFERENCES suppliers NOT NULL,  -- supplier debe existir
  order_id uuid REFERENCES orders,                 -- opcional: muestra puede existir antes del pedido
  linked_item_id uuid REFERENCES order_items,      -- si se promovio a item
  sku_candidate text,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  cost numeric,
  currency text DEFAULT 'USD',
  shipping_method sample_shipping_method,
  status sample_status NOT NULL DEFAULT 'requested',
  evaluation_result text,      -- approved|rejected|needs_revision
  evaluation_notes text,
  evaluated_by uuid REFERENCES auth.users,
  evaluated_at timestamptz,
  requested_at timestamptz DEFAULT now(),
  received_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_samples_company ON samples(company_id);
CREATE INDEX idx_samples_supplier ON samples(supplier_id);
CREATE INDEX idx_samples_order ON samples(order_id);
CREATE INDEX idx_samples_status ON samples(status);

-- ============================================================================
-- PAYMENTS (tabla aparte, vinculable a docs)
-- ============================================================================

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  order_id uuid REFERENCES orders NOT NULL,
  type payment_type NOT NULL,
  payee payment_payee NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'USD',
  due_date date,
  paid_at timestamptz,
  status payment_status NOT NULL DEFAULT 'pending',
  reference text,
  linked_document_id uuid,     -- FK a documents, se setea despues
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ============================================================================
-- DOCUMENTS: extender con kind tipado, item_id, triggers_payment
-- ============================================================================

ALTER TABLE documents ADD COLUMN kind doc_kind;
ALTER TABLE documents ADD COLUMN item_id uuid REFERENCES order_items;
ALTER TABLE documents ADD COLUMN triggers_payment boolean DEFAULT false;
ALTER TABLE documents ADD COLUMN linked_payment_id uuid REFERENCES payments;

CREATE INDEX idx_documents_kind ON documents(kind);
CREATE INDEX idx_documents_item ON documents(item_id);

-- FK circular: documents.linked_payment_id <-> payments.linked_document_id
ALTER TABLE payments ADD CONSTRAINT payments_linked_document_fk
  FOREIGN KEY (linked_document_id) REFERENCES documents(id);

-- ============================================================================
-- PHASE TRANSITIONS (audit log del state machine)
-- ============================================================================

CREATE TABLE phase_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES order_items ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,
  from_phase phase,
  to_phase phase NOT NULL,
  from_step text,
  to_step text NOT NULL,
  actor text NOT NULL,         -- 'agent' | 'user' | subagent name
  actor_user_id uuid REFERENCES auth.users,
  reason text,
  evidence jsonb DEFAULT '{}',
  ts timestamptz DEFAULT now()
);

CREATE INDEX idx_phase_transitions_item ON phase_transitions(item_id);
CREATE INDEX idx_phase_transitions_ts ON phase_transitions(ts DESC);

-- ============================================================================
-- TRIGGER: derivar orders.current_phase desde items (min phase de items activos)
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_order_phase(p_order_id uuid) RETURNS void AS $$
DECLARE
  min_phase phase;
BEGIN
  SELECT current_phase INTO min_phase
  FROM order_items
  WHERE order_id = p_order_id AND cancelled = false
  ORDER BY array_position(
    ARRAY['sourcing','negotiation','preliminary_costing','forwarder_quotation',
          'final_costing','purchase_order','production','documentation','shipping',
          'customs_cl','last_mile','received','closed']::phase[],
    current_phase
  )
  LIMIT 1;

  UPDATE orders SET current_phase = min_phase, updated_at = now()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_items_phase_sync() RETURNS trigger AS $$
BEGIN
  PERFORM recompute_order_phase(COALESCE(NEW.order_id, OLD.order_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_phase_sync
  AFTER INSERT OR UPDATE OF current_phase, cancelled OR DELETE
  ON order_items
  FOR EACH ROW EXECUTE FUNCTION trg_order_items_phase_sync();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_transitions ENABLE ROW LEVEL SECURITY;

-- Suppliers: admin full, client read
CREATE POLICY "Admin suppliers" ON suppliers FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read suppliers" ON suppliers FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Order items: admin full, client read
CREATE POLICY "Admin order_items" ON order_items FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read order_items" ON order_items FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Samples: admin full, client read
CREATE POLICY "Admin samples" ON samples FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read samples" ON samples FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Payments: admin full, client read
CREATE POLICY "Admin payments" ON payments FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read payments" ON payments FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Phase transitions: admin full, client read
CREATE POLICY "Admin phase_transitions" ON phase_transitions FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read phase_transitions" ON phase_transitions FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
