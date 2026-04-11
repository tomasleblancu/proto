-- Multi-supplier support: each order_item can belong to a different supplier.
-- orders.supplier_id sigue como "supplier principal" del embarque (BL consolidado),
-- pero order_items.supplier_id permite discriminar items por proveedor dentro de un
-- mismo pedido consolidado.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers;

CREATE INDEX IF NOT EXISTS idx_order_items_supplier ON order_items(supplier_id);
