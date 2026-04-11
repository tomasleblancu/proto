-- Add an optional manual title override for orders.
-- When set, takes precedence over the derived title (product name / item description).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS title text;
