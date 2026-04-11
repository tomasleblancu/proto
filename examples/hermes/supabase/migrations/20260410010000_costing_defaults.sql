-- Valores de referencia para costeo preliminar.
-- Editables desde /admin. El agente los lee con `get_costing_defaults`.
-- Estructura basada en la planilla real del forwarder: cada linea tiene
-- un tipo de calculo (flat, per_cbm, pct_fob, pct_cif), moneda, y minimo.

CREATE TABLE costing_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,             -- display: 'USD', 'USD/cbm', 'CLP/cbm', '%'
  currency text NOT NULL DEFAULT 'USD',  -- moneda del monto: 'USD' o 'CLP'
  category text NOT NULL,         -- 'freight', 'taxes', 'services', 'port', 'lastmile'
  qty_type text NOT NULL DEFAULT 'flat', -- 'flat', 'per_cbm', 'pct_fob', 'pct_cif'
  minimum numeric DEFAULT 0,      -- monto minimo por linea
  sort_order integer DEFAULT 0,
  notes text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO costing_defaults (key, label, value, unit, currency, category, qty_type, minimum, sort_order, notes) VALUES
  ('freight',           'Flete',               60,     'USD/cbm',  'USD',  'freight',  'per_cbm',  150,    10, 'USD por m3, min USD 150'),
  ('insurance',         'Seguro',              0.39,   '%',        'USD',  'freight',  'pct_cif',  40,     20, '% sobre CIF, min USD 40'),
  ('deconsolidation',   'Desconsolidacion',    12000,  'CLP/cbm',  'CLP',  'port',     'per_cbm',  45000,  30, 'CLP por m3, min CLP 45.000'),
  ('agent_fee',         'Honorarios agente',   0.50,   '%',        'USD',  'services', 'pct_fob',  100,    40, '% sobre FOB, min USD 100'),
  ('dispatch_fee',      'Despacho',            80,     'USD',      'USD',  'services', 'flat',     80,     50, 'Flat USD'),
  ('storage',           'Almacenaje',          55,     'USD/cbm',  'USD',  'port',     'per_cbm',  0,      60, 'USD por m3'),
  ('receiving',         'Recepcion/Despacho',  40,     'USD/cbm',  'USD',  'port',     'per_cbm',  0,      70, 'USD por m3'),
  ('documentation',     'Documentacion',       180,    'USD',      'USD',  'services', 'flat',     0,      80, 'Flat USD'),
  ('transport',         'Transporte local',    500000, 'CLP',      'CLP',  'lastmile', 'flat',     500000, 90, 'CLP, depende de destino'),
  ('duties_general_pct','Arancel general',     6,      '%',        'USD',  'taxes',    'pct_cif',  0,     100, 'Sin TLC. Con TLC/COO = 0%'),
  ('duties_tlc_pct',    'Arancel con TLC',     0,      '%',        'USD',  'taxes',    'pct_cif',  0,     110, 'Con Form F o COO valido'),
  ('iva_pct',           'IVA importacion',     19,     '%',        'CLP',  'taxes',    'pct_cif',  0,     120, 'Sobre (CIF + arancel)'),
  ('fizko_negotiation', 'Fee negociacion Fizko',50,    'USD',      'USD',  'services', 'flat',     0,     130, 'Si Fizko negocia por el cliente');

-- RLS
ALTER TABLE costing_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read costing_defaults" ON costing_defaults
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin manage costing_defaults" ON costing_defaults
  FOR ALL USING (
    auth.uid() IN (SELECT owner_id FROM companies)
  );
