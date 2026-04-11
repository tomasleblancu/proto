-- 1. Crear supplier "Xiaotu" para items del pedido 00dad060 (received, legacy)
INSERT INTO suppliers (id, company_id, name, country_code)
VALUES ('a0000000-0000-0000-0000-000000000001', '1e9fb74b-d0ee-41d6-adc5-72b92c459a6d', 'Xiaotu International Trade (Hubei) Co., Ltd', 'CN')
ON CONFLICT DO NOTHING;

-- Vincular supplier a order y a la tabla orders tambien
UPDATE orders SET supplier_id = 'a0000000-0000-0000-0000-000000000001'
WHERE id = '00dad060-3ba9-40f3-9812-2c7fad0c8271' AND supplier_id IS NULL;

-- 2. Asignar suppliers a todos los items huerfanos via orders.supplier_id
--    Nantong (e24d74e3), Xiaotu (00dad060)
UPDATE order_items oi
SET supplier_id = o.supplier_id
FROM orders o
WHERE oi.order_id = o.id
  AND oi.supplier_id IS NULL
  AND o.supplier_id IS NOT NULL;

-- 3. Borrar items "Por definir" (pedidos de prueba sin supplier real)
DELETE FROM order_items
WHERE supplier_id IS NULL;

-- 4. Backfill product_suppliers desde order_items existentes
INSERT INTO product_suppliers (product_id, supplier_id, company_id)
SELECT DISTINCT oi.product_id, oi.supplier_id, oi.company_id
FROM order_items oi
WHERE oi.product_id IS NOT NULL
  AND oi.supplier_id IS NOT NULL
ON CONFLICT (product_id, supplier_id) DO NOTHING;

-- 5. Hacer supplier_id NOT NULL
ALTER TABLE order_items ALTER COLUMN supplier_id SET NOT NULL;
