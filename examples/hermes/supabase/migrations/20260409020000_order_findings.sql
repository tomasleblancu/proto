-- Order findings: log de hallazgos del agente sobre un pedido.
-- Cada vez que el agente lee un mail, documento o infiere algo relevante,
-- registra un finding con link al mail de origen cuando aplica. Esto provee
-- trazabilidad: "este step avanzo porque llego el mail X del forwarder".

CREATE TYPE finding_source AS ENUM ('email', 'document', 'manual', 'agent_inference');
CREATE TYPE finding_category AS ENUM (
  'status_update', 'issue', 'payment', 'logistics',
  'document', 'contact', 'other'
);

CREATE TABLE order_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  source finding_source NOT NULL,
  category finding_category NOT NULL DEFAULT 'status_update',
  summary text NOT NULL,
  details text,
  phase text,
  actor text,
  gmail_message_id text,
  mail_message_id uuid REFERENCES mail_messages(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_findings_order_idx ON order_findings(order_id, occurred_at DESC);
CREATE INDEX order_findings_company_idx ON order_findings(company_id, occurred_at DESC);
CREATE INDEX order_findings_gmail_idx ON order_findings(gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE UNIQUE INDEX order_findings_dedup_idx
  ON order_findings(order_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

ALTER TABLE order_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin order_findings" ON order_findings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read order_findings" ON order_findings FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
