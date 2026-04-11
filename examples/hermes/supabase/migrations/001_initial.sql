-- Hermes: Import Management Schema
-- Generated from /plan-eng-review on 2026-04-01

-- Enums
CREATE TYPE order_status AS ENUM (
  'draft','po_sent','production','shipped',
  'in_transit','customs','delivered','cancelled','on_hold'
);
CREATE TYPE doc_type AS ENUM (
  'proforma_invoice','commercial_invoice','packing_list',
  'bl','certificate_of_origin','din','insurance','customs_release','other'
);
CREATE TYPE company_role AS ENUM ('admin','client');

-- Tables
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rut text,
  contact_email text,
  contact_phone text,
  owner_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  role company_role NOT NULL DEFAULT 'client',
  UNIQUE(company_id, user_id)
);

CREATE TABLE forwarders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text
);

CREATE TABLE customs_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  supplier_name text NOT NULL,
  supplier_contact text,
  products jsonb NOT NULL DEFAULT '[]',
  status order_status NOT NULL DEFAULT 'draft',
  po_number text,
  total_amount numeric,
  currency text DEFAULT 'USD',
  incoterm text,
  payment_terms text,
  forwarder_id uuid REFERENCES forwarders,
  customs_agent_id uuid REFERENCES customs_agents,
  estimated_arrival date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders NOT NULL,
  event_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,
  doc_type doc_type NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  validated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE reorder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  supplier_name text NOT NULL,
  product_description text NOT NULL,
  quantity integer NOT NULL,
  frequency_days integer NOT NULL,
  lead_time_days integer DEFAULT 0,
  last_ordered_at timestamptz,
  next_order_date date,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Indexes (FK columns + common filters)
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_events_order ON order_events(order_id);
CREATE INDEX idx_documents_order ON documents(order_id);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_reorder_rules_company ON reorder_rules(company_id);
CREATE INDEX idx_reorder_rules_next ON reorder_rules(next_order_date) WHERE active = true;
CREATE INDEX idx_company_users_company ON company_users(company_id);
CREATE INDEX idx_company_users_user ON company_users(user_id);

-- Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

-- Admin: full access to their companies
CREATE POLICY "Admin full access" ON companies FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Client read own company" ON companies FOR SELECT
  USING (id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Orders: admin full, client read-only
CREATE POLICY "Admin orders" ON orders FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "Client read orders" ON orders FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Documents: admin full, client read + upload
CREATE POLICY "Admin documents" ON documents FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "Client read documents" ON documents FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

CREATE POLICY "Client upload documents" ON documents FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Order events: admin full, client read-only
CREATE POLICY "Admin order_events" ON order_events FOR ALL
  USING (order_id IN (
    SELECT id FROM orders WHERE company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  ));

CREATE POLICY "Client read order_events" ON order_events FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders WHERE company_id IN (
      SELECT company_id FROM company_users WHERE user_id = auth.uid()
    )
  ));

-- Reorder rules: admin only
CREATE POLICY "Admin reorder_rules" ON reorder_rules FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- Company users: admin manages, users read own
CREATE POLICY "Admin manage company_users" ON company_users FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "User read own membership" ON company_users FOR SELECT
  USING (user_id = auth.uid());
