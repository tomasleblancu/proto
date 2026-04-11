---
name: hermes-reorders
description: Automatizacion de recompras periodicas
mcp-tools:
  - create_reorder_rule
  - check_reorders
  - trigger_reorder
  - list_reorder_rules
  - send_alert
depends:
  - hermes-orders
---

# Recompras

## Logica de recompra

Las reglas de recompra automatizan pedidos recurrentes con proveedores conocidos.

Cada regla define:
- **product_description**: que se compra
- **supplier_name**: a quien
- **quantity**: cuanto
- **frequency_days**: cada cuantos dias
- **lead_time_days**: tiempo de anticipacion

## Calculo

`next_order_date = last_ordered_at + frequency_days`

Si se salta una recompra, `next_order_date` se recalcula desde hoy.

## Flujo

1. Se crea la regla con `create_reorder_rule`
2. Un cron diario ejecuta `check_reorders` para identificar productos vencidos
3. Se envia alerta al fundador via WhatsApp con `send_alert`
4. El fundador confirma → se ejecuta `trigger_reorder`
5. `trigger_reorder` crea un nuevo pedido en estado `draft`
6. Se actualiza `last_ordered_at` y `next_order_date` de la regla

## Confirmacion

SIEMPRE pedir confirmacion antes de ejecutar `trigger_reorder`.
La confirmacion expira en 24 horas. Si no hay respuesta, se re-envia el recordatorio.

## Alertas

`send_alert` es un tool compartido que se usa para:
- Cambios de estado de pedido
- Solicitudes de documentos faltantes
- Recordatorios de recompra
