-- Add sourcing status to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'sourcing' BEFORE 'draft';

-- Add sourcing method to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sourcing_method text; -- 'hermes' or 'client'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_requirements jsonb DEFAULT '{}';

-- product_requirements shape:
-- {
--   description: string,        -- what the client wants to import
--   target_quantity: number,
--   target_unit_price: number,   -- ideal price per unit
--   target_currency: string,
--   quality_specs: string,       -- material, certifications, etc
--   reference_url: string,       -- alibaba link, image, etc
--   urgency: 'low' | 'medium' | 'high',
--   notes: string
-- }
