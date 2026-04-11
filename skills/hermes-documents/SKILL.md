---
name: hermes-documents
description: Gestion documental tipada por incoterm, con vinculacion automatica a pagos.
mcp-tools:
  - upload_to_storage
  - attach_document
  - update_document
  - list_required_docs
  - list_documents
  - validate_document_set
depends:
  - hermes-orders
---

# Documentos de Importacion

## ⚠️ REGLA DURA — flujo de documentos

Cuando el usuario sube un archivo por chat, el flujo es SIEMPRE:

1. **Lee el archivo** con `Read` para extraer el contenido relevante (montos, fechas, items, numeros de factura, etc).
2. **`upload_to_storage(local_path, company_id, order_id)`** — sube el archivo temporal a Supabase Storage. El archivo temporal se borra en 5 min, así que hazlo INMEDIATAMENTE.
3. **`attach_document(company_id, order_id, kind, filename, storage_path, extracted)`** — registra el doc en DB con el `storage_path` devuelto por `upload_to_storage` y el JSON `extracted` con el contenido estructurado.

**REGLA DURA — `extracted` es OBLIGATORIO:** El campo `extracted` es requerido al llamar `attach_document`. Si no lo pasas, el tool falla. SIEMPRE lee el archivo ANTES de adjuntarlo para extraer los datos. Este JSON contiene los datos clave del documento para que futuras sesiones no necesiten re-leer el PDF/imagen. El contenido depende del tipo de documento:

| kind | campos `extracted` esperados |
|---|---|
| `proforma_invoice` | `{invoice_number, date, supplier, items: [{description, qty, unit_price, total}], total, currency, payment_terms}` |
| `commercial_invoice` | `{invoice_number, date, supplier, buyer, items: [{description, qty, unit_price, total}], total, currency, incoterm}` |
| `packing_list` | `{items: [{description, qty, boxes, dimensions_cm, weight_kg, cbm}], total_boxes, total_weight_kg, total_cbm}` |
| `bill_of_lading` | `{bl_number, shipper, consignee, vessel, port_loading, port_discharge, date, container, etd, eta}` |
| `forwarder_invoice` | `{invoice_number, date, items: [{concept, amount}], total, currency, dual_currency?: {usd, clp}}` |
| `customs_funds_provision` | `{date, total, currency, breakdown?: [{concept, amount}]}` |
| `port_invoice` | `{invoice_number, date, items: [{concept, amount}], total, currency}` |
| `customs_agent_invoice` | `{invoice_number, date, items: [{concept, amount}], total, currency}` |
| `certificate_of_origin` / `form_f` | `{number, date, origin_country, exporter, items}` |
| `din` | `{din_number, date, fob, cif, duties, iva, total}` |

Si no puedes extraer algun campo, omitelo — pero NUNCA omitas `extracted` completamente.

NUNCA llames `attach_document` con un path local (`/data/sessions/...`) — esos archivos son temporales y el preview no funciona.

NUNCA uses `upload_document` (legacy). SIEMPRE `attach_document` con `kind`
explicito del enum. Si no sabes el `kind`, pregunta al usuario — no lo
inventes ni uses `other` por comodidad. Sin el `kind` correcto el documento
no se marca en el widget del cockpit y rompe el checklist.

Ejemplos de mapeo correcto:
- Factura de Klog → `forwarder_invoice` (no `other`, no `insurance`)
- Provision de fondos a Menares → `customs_funds_provision`
- Factura de puerto → `port_invoice`
- Comprobante de transferencia/boleta de pago → `payment_receipt` con
  `receipt_for_document_id` apuntando a la factura que justifica

## Factura → Pago → Comprobante

Una factura pagable vive en 3 estados:

1. **Cargada** — `attach_document(kind='forwarder_invoice', ...)` → el doc existe.
2. **Pagada** — `record_payment(linked_document_id=<doc_id>, status='paid', ...)`
   con la moneda real (ver regla de moneda en hermes-orders).
3. **Con comprobante** — cuando el usuario sube el PDF/imagen de la
   transferencia o boleta, `attach_document(kind='payment_receipt',
   receipt_for_document_id=<factura_doc_id>, ...)`. El tool actualiza
   automaticamente la factura original para apuntar a este receipt.

El widget del cockpit muestra los 3 estados: ✓ cargada, ● pagado/pendiente,
📄 con comprobante.

## Tipos canonicos (`DocKind`)

**Comerciales (proveedor)**
| kind | descripcion |
|---|---|
| `proforma_invoice` | Cotizacion formal del proveedor. Base para aprobar costo y registrar deposito. |
| `commercial_invoice` | Factura comercial definitiva. Requerida para customs. |
| `packing_list` | Detalle de bultos, pesos, dimensiones. |
| `bill_of_lading` | B/L maritimo o AWB aereo. |
| `certificate_of_origin` | TLC generico. |
| `form_f` | Certificado de origen Mercosur (AR/BR/PY/UY). |

**Forwarder (Klog)**
| kind | descripcion |
|---|---|
| `forwarder_invoice` | Facturas de Klog (freight, handling). Dispara pago. |
| `customs_funds_provision` | Provision de fondos a Klog para pagar derechos en aduana. Dispara pago. |
| `port_invoice` | Facturas del puerto (gastos portuarios). Generalmente se provisionan via `customs_funds_provision` y se facturan junto con el DIN. Dispara pago. |
| `customs_agent_invoice` | Honorarios/gastos del agente de aduana (ej: Menares). Se provisionan y facturan junto con el DIN. Dispara pago. |

**Aduana**
| kind | descripcion |
|---|---|
| `din` | Declaracion de Ingreso emitida por Aduana Chile. |

## Documentos que disparan pagos

`proforma_invoice`, `forwarder_invoice`, `customs_funds_provision`, `port_invoice`, `customs_agent_invoice`.

Cuando llamas `attach_document` y el `kind` es uno de estos, la respuesta incluye `triggers_payment: true` y un hint. **Registra el pago inmediatamente** con `record_payment`, vinculandolo al documento via `linked_document_id`.

## Documentos requeridos por incoterm

Llama `list_required_docs(incoterm)` para obtener la lista canonica. Para FOB:
- Required: `proforma_invoice`, `commercial_invoice`, `packing_list`, `bill_of_lading`, `forwarder_invoice`, `customs_funds_provision`, `port_invoice`, `din`
- Conditional: `certificate_of_origin` o `form_f` (segun TLC del pais origen — usar `detect_tlc_requirement`)

## Mapeo a fases del state machine

| Fase | Documentos esperados |
|---|---|
| negotiation | `proforma_invoice` (al final, para gate de preliminary_costing) |
| purchase_order | `proforma_invoice` aceptada + pago `deposit` |
| documentation | `commercial_invoice`, `packing_list`, `bill_of_lading`, `certificate_of_origin`/`form_f` si aplica |
| final_costing | `customs_funds_provision` (estimacion de gastos portuarios + agente de aduana, cobrada por adelantado) |
| customs_cl | `din` (durante), `port_invoice` + `customs_agent_invoice` (entregadas junto con el DIN, ajustan vs. la provision) |
| closed | todas las `forwarder_invoice` y `port_invoice` cargadas |

## `extracted` — leer una vez, usar siempre

El campo `extracted` guarda el contenido estructurado del documento (montos, fechas, items). **Evita re-leer el PDF en cada sesion.**

**Al consultar un documento (`get_document` o `list_documents`):**
- Si `extracted` NO es null → **usa esos datos directamente.** No descargues ni leas el PDF.
- Si `extracted` ES null → el documento se subio antes de esta funcionalidad. Lee el PDF (via download_url + WebFetch o Read), extrae los datos, y **inmediatamente** llama `update_document(document_id, extracted={...})` para guardarlo. Asi la proxima sesion no necesita re-leer.

**REGLA DURA:** nunca leas un PDF si `extracted` ya tiene datos. Nunca dejes un `extracted` vacio despues de leer un PDF — siempre persiste lo que extrajiste.

## Reglas

- Siempre tipar el documento con `kind`. No usar `other` salvo casos verdaderamente atipicos.
- Si el doc es del proveedor, asociarlo al `item_id` cuando aplique.
- Si el doc dispara pago y no registras el payment, el balance del pedido queda inconsistente.
- Para validar antes de avanzar de fase, usa la lista de `list_required_docs` filtrada por la fase actual.
