-- Contacts: libreta de direcciones por empresa con roles clave
-- (forwarder, customs_agent, supplier, other). Múltiples contactos por rol.
-- Scope: 'company' = default de la empresa; 'order' = override para una orden.

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('forwarder', 'customs_agent', 'supplier', 'other')),
  name text NOT NULL,
  email text,
  phone text,
  organization text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_company_role_idx ON contacts(company_id, role);
CREATE INDEX contacts_order_idx ON contacts(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX contacts_email_idx ON contacts(lower(email)) WHERE email IS NOT NULL;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin contacts" ON contacts FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read contacts" ON contacts FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
