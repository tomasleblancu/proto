-- Volumen y peso del pedido (inputs clave para costeo por CBM)
ALTER TABLE orders
  ADD COLUMN cbm numeric,        -- volumen total en m3
  ADD COLUMN weight_kg numeric;  -- peso total en kg
