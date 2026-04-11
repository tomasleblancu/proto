---
name: hermes-customs-cl
description: Aduana Chile — proceso de internacion, calculo de derechos, TLCs, mapeo a la fase customs_cl del state machine.
mcp-tools:
  - detect_tlc_requirement
  - record_payment
  - attach_document
depends:
  - hermes-orders
  - hermes-documents
---

# Aduana Chile

## Mapeo a la fase `customs_cl`

Sub-pasos del state machine y que hacer en cada uno:

| Sub-paso | Accion |
|---|---|
| `din_preparation` | Verificar que estan todos los docs comerciales (CI, PL, B/L, COO/Form F si aplica). Klog prepara la DIN. |
| `register_customs_funds_provision` | Klog emite `customs_funds_provision`. Adjuntar doc + registrar pago tipo `customs_provision` payee `forwarder`. |
| `din_submitted` | Klog presenta DIN ante Aduana. |
| `aforo` | Aduana puede inspeccionar (aleatorio o dirigido). Si hay aforo fisico, anotar en metadata. |
| `duties_paid` | Klog paga derechos+IVA con la provision. Adjuntar `port_invoice`s, registrar pagos tipo `port`/`duties`. |
| `released` | Mercaderia liberada. Avanzar a `last_mile`. |

## Calculo de derechos (referencia)

- **Arancel general**: 6% sobre valor CIF.
- **IVA**: 19% sobre (CIF + arancel).
- **Con TLC**: muchos productos tienen arancel 0% si se presenta certificado de origen valido.

Antes de calcular, llamar `detect_tlc_requirement(country_origin)`:
- `form_f` → arancel preferencial via Mercosur. Exigir Form F.
- `certificate_of_origin` → arancel preferencial via TLC. Exigir COO.
- `none` → arancel general 6%.

## Documentos requeridos por Aduana para DIN

- `commercial_invoice`
- `packing_list`
- `bill_of_lading`
- `certificate_of_origin` o `form_f` (si se reclama beneficio arancelario)
- (seguro generalmente lo cubre Klog en FOB)

## Plazos legales

- DIN: hasta 60 dias desde el arribo.
- Mercaderia en zona primaria: max 90 dias. Despues = abandono legal.
- Si vas cerca del limite, marcar el item como `block_item` con razon "plazo aduana proximo".

## Permisos especiales por producto

Algunos productos requieren autorizacion adicional. Si el item los requiere, registrarlo en sourcing/negotiation y bloquear customs_cl hasta tenerlos:

- Alimentos → SAG
- Productos quimicos → ISP
- Electronicos → SEC
- Cosmetica → ISP
- Juguetes → SERNAC

## Como subagent (`customs-researcher`)

Cuando el orquestador te delega un item en `customs_cl`, tu trabajo es:
1. Leer el state actual con `get_item_state`.
2. Verificar que los docs comerciales estan completos.
3. Calcular derechos estimados (CIF × arancel + IVA).
4. Avanzar sub-paso a sub-paso con `advance_step`.
5. Reportar al orquestador: derechos pagados, fecha de release, anomalias.
