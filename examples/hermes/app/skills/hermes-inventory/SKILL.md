---
name: hermes-inventory
description: Control de inventario por producto
mcp-tools:
  - get_inventory
  - adjust_inventory
  - get_inventory_history
depends:
  - hermes-products
---

# Inventario

Cada producto tiene stock en 3 etapas:

- **Reservado**: comprometido en un pedido pero aun no despachado (estados: sourcing, draft, po_sent, production)
- **En transito**: despachado pero no recibido (estados: shipped, in_transit, customs)
- **Disponible**: recibido y listo para la venta (estado: delivered)

## Flujo automatico con pedidos

Cuando un pedido cambia de estado, el inventario se ajusta automaticamente:
- Pedido creado → reservado += cantidad
- Pedido despachado (shipped) → reservado -= cantidad, en_transito += cantidad
- Pedido entregado (delivered) → en_transito -= cantidad, disponible += cantidad
- Pedido cancelado → reservado -= cantidad

## Ajustes manuales

El usuario puede hacer ajustes manuales con `adjust_inventory`:
- **sale**: disponible -= cantidad (venta realizada)
- **return**: disponible += cantidad (devolucion)
- **damage**: disponible -= cantidad (merma/dano)
- **count**: correccion por conteo fisico
- **manual**: ajuste generico con razon

## Historial

Cada ajuste queda registrado en `inventory_adjustments` con tipo, cantidad, razon, y orden asociada si aplica. Usar `get_inventory_history` para ver movimientos.
