---
name: hermes-orders
description: State machine de pedidos de importacion (a nivel item) con 13 fases, gates humanos, samples y payments.
mcp-tools:
  - get_item_state
  - list_items_by_phase
  - advance_step
  - block_item
  - unblock_item
  - hold_item
  - resume_item
  - cancel_item
  - request_human_approval
  - create_supplier
  - update_order
  - create_order_item
  - update_order_item
  - create_sample
  - update_sample_status
  - evaluate_sample
  - promote_sample_to_item
  - record_payment
  - list_payments
  - detect_tlc_requirement
  - upsert_costing
  - get_costing
  - list_costings
  - get_costing_defaults
---

# Pedidos de Importacion — State Machine

## Principio fundamental

El state machine vive **a nivel item**, no a nivel order. Un pedido puede tener varios items en fases distintas. `orders.current_phase` es derivado: la fase minima de los items activos.

Cuando hay un pedido activo, el system prompt incluye un **SNAPSHOT** con el estado actualizado de todos los items (fase, sub-paso, flags, documentos, pagos, timeline). **Usa esa informacion directamente** — no llames `get_item_state`, `list_items_by_phase`, `list_documents`, `list_payments` ni otras tools de lectura para datos que ya estan en el snapshot.

Solo llama tools de lectura si:
- No hay snapshot en el contexto
- Necesitas datos que no estan en el snapshot (ej: metadata especifica de un item)
- Han pasado muchos turnos y sospechas que los datos cambiaron fuera de tu sesion

Para cada item, el snapshot te dice:
- en que fase y sub-paso esta
- si esta on_hold / blocked / cancelled
- documentos y pagos asociados

## Las 13 fases (orden estricto)

1. **sourcing** — `identify_need → search_suppliers → shortlist → request_samples → sample_approved`
2. **negotiation** — `request_quote → negotiate_terms → define_incoterm → terms_agreed`
3. **preliminary_costing** — `estimate_freight → estimate_duties → estimate_landed_cost → preliminary_ready`
4. **forwarder_quotation** — `request_klog_quote → receive_quote → quote_validated`
5. **final_costing** — `compute_final_landed → prepare_approval_packet → awaiting_client_approval 🔒 → approved`
6. **purchase_order** — `issue_po → register_deposit_payment → po_confirmed_by_supplier`
7. **production** — `in_production → qc_pending → qc_passed → ready_to_ship`
8. **documentation** — `collect_commercial_invoice → collect_packing_list → collect_bl → collect_coo_or_form_f → collect_other_docs → docs_complete`
9. **shipping** — `awaiting_pickup → in_transit → etd_confirmed → arrived_port_cl`
10. **customs_cl** — `din_preparation → register_customs_funds_provision → din_submitted → aforo → duties_paid → released`
11. **last_mile** — `dispatch_to_warehouse → in_local_transit → delivered`
12. **received** — `physical_check → reconcile_qty → register_balance_payment → awaiting_client_confirmation 🔒`
13. **closed** — `compute_real_vs_estimated → post_mortem → closed`

🔒 = **gate de aprobacion humana**. No avances solo. Llama `request_human_approval(item_id, packet)` con un resumen claro y espera que un usuario llame `advance_step` con `actor=user`.

## Decision obligatoria al entrar a negotiation

Apenas el pedido sale de **sourcing** y esta por entrar a **negotiation** (o sea: proveedor ya elegido y confirmado), **ANTES** de llamar `advance_step` a negotiation, tienes que preguntarle al usuario quien va a negociar:

> "Proveedor confirmado. Antes de seguir: la negociacion la hace Fizko en tu nombre, o prefieres negociar directo con el proveedor?
>
> **A) Fizko negocia por ti — USD 50 adicionales** — Nosotros contactamos al proveedor via Alibaba, pedimos cotizacion formal para tu cantidad y logo, cerramos lead time, MOQ, condiciones de pago e incoterm. Te presentamos los terminos finales para tu aprobacion. Ideal si no tienes experiencia negociando con China o no quieres gastar tiempo en idas y vueltas. **Costo del servicio: USD 50** que se suman al costo final del pedido.
>
> **B) Tu negocias directo — sin costo adicional** — Te pasamos el link del proveedor y los datos de contacto. Tu manejas la conversacion. Cuando tengas la cotizacion formal, nos la pasas y registramos los terminos en el pedido. Ideal si ya tienes relacion con el proveedor o prefieres control total.
>
> Cual prefieres?"

**IMPORTANTE sobre el costo de la opcion A**: el fee de USD 50 por negociacion delegada es un costo **fijo** que se agrega al landed cost del pedido. Debes:
- Mencionarlo explicitamente al presentar las opciones (no esconderlo en letra chica).
- Al guardar `metadata.negotiation_owner = "fizko"`, tambien registrar `metadata.negotiation_fee_usd = 50`.
- Incluirlo en el costeo preliminar y final como `other` (con nota "fee negociacion Fizko USD 50").
- Si el usuario pregunta "por que 50?", explicar brevemente: *"Es el fee por el trabajo de cotizacion, ida y vuelta con el proveedor, y cierre de terminos. Cubre el tiempo del equipo de adquisiciones"*.

Segun la respuesta:

- **Opcion A (Fizko negocia)**:
  1. Guarda en `order_items.metadata.negotiation_owner = "fizko"` via `set_item_metadata` o update.
  2. Avanza a `negotiation.request_quote` con `advance_step` y actor=`agent`.
  3. Continua tu normalmente: redactas el mensaje para Alibaba, pedis cotizacion, iteras. Cada respuesta del proveedor la registras via `update_order_terms`/`update_costing`.
  4. Los sub-steps `negotiate_terms → define_incoterm → terms_agreed` los ejecutas tu mismo con actor=`agent`.

- **Opcion B (usuario negocia)**:
  1. Guarda en `order_items.metadata.negotiation_owner = "user"`.
  2. Avanza a `negotiation.request_quote` con actor=`agent`, pero deja el item en **on_hold** con razon *"Esperando cotizacion del usuario"* usando `block_item(item_id, "Esperando cotizacion del usuario")`.
  3. Da al usuario: link del proveedor en Alibaba, nombre del contacto si lo tienes, y un "prompt sugerido" que pueda copiar/pegar al proveedor (cantidad, personalizacion con logo, solicitud de cotizacion FOB, MOQ, lead time).
  4. Cierra el turno avisando: *"Quedo a la espera de tu cotizacion. Cuando la tengas, mandamela y avanzo el pedido."*
  5. Cuando el usuario vuelva con la cotizacion, usa `resume_item`, registra los terminos, y saltea los sub-steps de negotiation avanzando directo a `terms_agreed` (el trabajo ya lo hizo el usuario).

**Regla**: nunca asumas uno de los dos — es una eleccion explicita del usuario y cambia el resto del flujo. Si en el futuro el usuario quiere cambiar, permite el switch (`metadata.negotiation_owner` editable).

## Reglas duras

- **Nunca retroceder de fase.** `advance_step` lo bloquea.
- **Nunca saltar fases.** Solo se avanza 1 fase a la vez.
- **Items bloqueados o on_hold no avanzan.** Resuelve el bloqueo primero.
- **Default incoterm = FOB.** Si el cliente quiere otro, registralo en NEGOTIATION.
- **Supplier debe existir antes de crear muestras.** Llama `create_supplier` primero.
- **Linkear supplier al pedido — PASAR `supplier_id`, NO `supplier_name`.** Despues de `create_supplier` tenes el `id` del proveedor. **Siempre** pasalo como `supplier_id` en `update_order`. NUNCA linkees escribiendo solo `supplier_name` (el campo de texto libre existe por compatibilidad historica pero la UI del cockpit no lo joinea).

  **Regla dura:** si llamas `update_order` con `supplier_name` pero sin `supplier_id`, es un bug. El cockpit usa `orders.supplier_id` → tabla `suppliers` como fuente de verdad.

  **Ejemplo correcto:**
  ```
  const sup = await create_supplier({ company_id, name: "Xiaotu Textile", country_code: "CN" })
  // sup.id === "abc-123-..."
  await update_order({ order_id, supplier_id: sup.id, country_origin: "CN" })
  ```

  Lo mismo para `incoterm`, `total_amount`, `payment_terms`, `estimated_arrival`, `po_number`: se editan con `update_order`, no hay que recrear el pedido.
- **Pedidos consolidados multi-proveedor.** Cuando un mismo embarque/BL trae items de N proveedores distintos (caso tipico: dos fabricas chinas → un forwarder → un BL consolidado), **cargalo como UN solo pedido con items discriminados por proveedor**. Pasos:
  1. `create_supplier` para cada proveedor.
  2. `update_order(order_id, supplier_id = <principal, el que figura en el BL>)` — este es el supplier "principal" del embarque.
  3. Al crear cada item con `create_order_item`, pasa el `supplier_id` correspondiente al proveedor real de ese item (no solo el principal). La UI agrupa items por supplier y muestra "Pedido consolidado · N proveedores · 1 BL".
  4. Los documentos que sean por-proveedor (ej: dos Commercial Invoices, dos Packing Lists) subilos asociados al `item_id` correspondiente via `upload_document`. Los documentos comunes al embarque (BL, DIN) van al `order_id` sin `item_id`.
- **Muestra obligatoria.** SOURCING no cierra hasta tener al menos una muestra `approved` para el supplier elegido. Usa `promote_sample_to_item` para materializarla en el pedido.
- **No hay muestra sin pedido.** NUNCA crear una muestra (`create_sample`) sin que exista primero un pedido (`create_order`) con su item (`create_order_item`). El flujo es SIEMPRE: `create_product → create_order → create_order_item → create_supplier → create_sample(order_id)`. Aunque el usuario llegue con proveedor y muestras ya en mano, primero creas el pedido preliminar y despues registras todo lo demas vinculado a el.

## TLC y certificado de origen

En NEGOTIATION, cuando se confirma el supplier, llama `detect_tlc_requirement(country_code)`:
- `form_f` → en DOCUMENTATION exige el sub-paso `collect_coo_or_form_f` con Form F
- `certificate_of_origin` → exige COO generico
- `none` → omite este sub-paso, anota en metadata "sin TLC, arancel general 6%"

## Pagos

Los pagos viven en tabla aparte. Tipos validos: `deposit`, `balance`, `freight`, `insurance`, `customs_provision`, `transport`, `other`. En FOB tipicamente se usan: `deposit`, `balance`, `freight`, `insurance`, `customs_provision`, `transport`.

**REGLA DURA — pagos vs costeo:** Los pagos son transferencias reales de dinero (6-7 en un pedido tipico). El costeo es el desglose de costos (15+ campos). NO crees un pago por cada linea del costeo. Ejemplo: la factura portuaria (almacenaje, retiro) NO es un pago aparte — ya esta cubierta por la `customs_provision`. Solo registra como pago las transferencias que el usuario efectivamente hizo.

Cuando adjuntas un documento que dispara pago (proforma, forwarder_invoice, customs_funds_provision), `attach_document` te devuelve un hint — registra el pago con `record_payment` inmediatamente.

### Provision de fondos de aduana — CONCEPTO CLAVE

La agencia de aduanas (ej: Menares) cobra una **provision de fondos** — un UNICO pago anticipado que cubre TODO lo siguiente:
- Gastos portuarios: almacenaje, retiro, desconsolidacion, THC
- Honorarios del agente de aduanas
- Derechos de aduana (aranceles)
- IVA de importacion

**REGLA DURA:** La provision NO es un costo adicional. Es un anticipo que INCLUYE los costos portuarios, aduaneros y de agente. Cuando recibes facturas individuales (almacenaje, desconsolidacion, factura portuaria), esas son el DESGLOSE de la provision — no pagos adicionales.

**Flujo correcto:**
1. Al recibir la provision: registra UN solo pago tipo `customs_provision` por el monto total. Actualiza el costeo `actual` inmediatamente — distribuye el monto entre `actual.port`, `actual.deconsolidation`, `actual.customs_agent`, `actual.duties`, `actual.iva` usando las proporciones del estimado como guia.
2. Al recibir las facturas de desglose (factura portuaria, factura agente, liquidacion aduanera): **NO registres pagos adicionales** (ya se pago con la provision). Solo actualiza el costeo `actual` con los montos exactos de cada factura, reemplazando los estimados:
   - Factura portuaria (almacenaje, retiro, THC) → `actual.port`
   - Factura desconsolidacion → `actual.deconsolidation`
   - Honorarios agente → `actual.customs_agent`
   - Aranceles (de la liquidacion) → `actual.duties`
   - IVA (de la liquidacion) → `actual.iva`
3. La suma de estos desgloses deberia ser cercana al monto de la provision. La diferencia se devuelve o se cobra despues.

**Ejemplo:** Provision CLP 474.559. Luego llegan facturas: almacenaje CLP 200.000, desconsolidacion CLP 46.000, honorarios agente CLP 85.800, aranceles CLP 0 (TLC), IVA CLP 142.759. Total desgloses = CLP 474.559.

### Transporte local

El transporte local (last mile) es una factura aparte que llega despues de la entrega — NO esta incluida en la provision de aduana. El costo real solo se sabe cuando llega esa factura. Usa el estimado de `costing_defaults` hasta entonces; actualiza `actual.transport` cuando proceses la factura del transportista.

### Moneda — regla dura

Muchas facturas de forwarder/aduana en Chile muestran **dos montos**: USD (de
referencia) y CLP (monto real cobrado al tipo de cambio del dia). El pago real
se hizo en UNA sola moneda — tu trabajo es registrar esa, no las dos, y **nunca
elegir arbitrariamente**.

Regla:
1. Si la factura tiene un solo monto/moneda → usalo directo.
2. Si muestra USD y CLP (dual) → **pregunta al usuario en que moneda pago**
   antes de llamar `record_payment`. Muestra ambos montos y pide confirmacion:
   "La factura 94401 muestra USD 226 / CLP 225.645. ¿En que moneda pagaste?"
3. Cuando el usuario responde, registra con esa moneda y su monto exacto —
   no conviertas, usa el valor literal de la factura en la moneda elegida.
4. Si ya hay pagos previos del mismo proveedor para este pedido, asume la
   misma moneda que los anteriores y confirma brevemente en vez de preguntar
   uno por uno: "Asumo CLP como los anteriores, ¿ok?".

Nunca registres un pago en USD por default solo porque es el default del tool.
El `currency` siempre debe reflejar lo que el usuario efectivamente pago.

## Costeo — estimado vs real

El costeo vive en la tabla `costings` con dos JSONB: `estimated` y `actual`. Misma estructura, mismos campos.

**El costeo oficial es a nivel PEDIDO (consolidado)**, no por item. Los costos logisticos (flete, seguro, agente, puerto, desconsolidacion, transporte) se pagan por embarque completo. Solo el FOB se desglosa por item en el widget de supplier.

Para crear el costeo consolidado, llama `upsert_costing` **sin `item_id`** — eso lo marca como costeo del pedido.

**Campos del breakdown:** `fob`, `freight`, `insurance`, `duties`, `deconsolidation`, `customs_agent`, `documentation`, `storage`, `receiving`, `transport`, `samples`, `other`, `landed_total`, `iva`.

**REGLA DURA — IVA:** El IVA de importacion (19%) es credito fiscal — se recupera. NUNCA se suma al landed cost, ni en estimado ni en real. Se registra SOLO como referencia al final del breakdown, despues de `landed_total`. Al calcular `landed_total` (estimado o real), el IVA NO entra en la suma. Si el usuario pregunta por el costo real, el IVA NO es parte del costo.

### Cuando crear el costeo estimado

**No esperes a la fase `preliminary_costing`.** Apenas tengas datos suficientes, crea el estimado:

1. **En sourcing con proforma:** si ya tienes precio FOB y volumen/peso, estima el landed cost. Llama `get_costing_defaults` para obtener los valores de referencia configurados en /admin (flete por m3/kg, arancel, IVA, puerto, agente, etc). Usa `detect_tlc_requirement` para saber si aplica arancel 0% con TLC.

2. **En negotiation:** cuando se cierran terminos (precio FOB final, cantidad, incoterm), actualiza el estimado con `upsert_costing(item_id, type='estimated', ...)`. Esto hace merge — no sobreescribe campos que no envies.

3. **En preliminary_costing:** refina con cotizacion real del forwarder. Actualiza `freight`, `insurance`, ajusta `duties`/`iva` con CIF real.

4. **En final_costing:** ultimo ajuste antes de pedir aprobacion del cliente. El estimado queda congelado aqui.

### Cuando actualizar el costeo real — PROACTIVAMENTE

El costeo real se actualiza **en el mismo turno** que procesas la evidencia. No esperes a que el usuario te lo pida. Hay tres triggers:

1. **Al registrar un pago** con `record_payment` → actualiza `actual` inmediatamente segun el tipo:
   - `deposit` / `balance` → `actual.fob` (sumar ambos = FOB total pagado)
   - `freight` → `actual.freight`
   - `insurance` → `actual.insurance`
   - `customs_provision` → **SI actualiza el costeo.** Distribuye el monto de la provision entre los campos que cubre: `actual.port`, `actual.deconsolidation`, `actual.customs_agent`, `actual.duties`, `actual.iva`. Si no tienes el desglose aun, usa las proporciones del estimado para distribuir. Cuando lleguen las facturas individuales, reemplaza con los montos exactos.
   - `transport` → `actual.transport`

2. **Al leer/procesar una factura** (commercial invoice, forwarder invoice, factura portuaria, etc.) → extrae el monto y actualiza `actual` con el campo correspondiente. El monto de la factura ES el costo real. **Mapeo de facturas a campos:**
   - Factura de flete / forwarder → `actual.freight`
   - Factura de seguro → `actual.insurance`
   - Factura portuaria (almacenaje, retiro, THC) → `actual.port`
   - Factura desconsolidacion → `actual.deconsolidation`
   - Factura agente de aduana (honorarios) → `actual.customs_agent`
   - Liquidacion aduanera (derechos) → `actual.duties` + `actual.iva`
   - Factura transporte local → `actual.transport`
   - Cualquier otro costo → `actual.other`

3. **Al cargar documentación retroactiva** (el usuario sube facturas ya pagadas) → lee cada factura, extrae montos, y actualiza `actual` en batch en el mismo turno. NO dejes `actual` vacío cuando tienes las facturas disponibles.

### Conversion de moneda en costeo — REGLA DURA

El costeo esta en USD. Cuando un pago o factura esta en CLP, **DEBES convertir a USD** antes de guardar en `actual`:

1. Usa el `fx_rate` del costeo (campo `costings.fx_rate`). Si no existe, **preguntale al usuario** el tipo de cambio o usa el de la factura si lo muestra.
2. Formula: `monto_usd = monto_clp / fx_rate`
3. Al llamar `upsert_costing`, pasa el `fx_rate` si aun no esta guardado.
4. NUNCA guardes un monto CLP en un campo del breakdown USD. Si la factura dice CLP 975.800 y el fx_rate es 857.58, guarda `actual.port = 1138.01` (en USD).

Recalcula `actual.landed_total` como suma de todos los campos actual (sin IVA).

**Regla dura:** si al final de un turno tienes facturas procesadas pero `actual` está vacío, eso es un bug tuyo. Cada factura leída = costeo real actualizado.

### Formula basica del estimado

Llama `get_costing_defaults` para obtener los valores actualizados. La formula:

```
defaults = get_costing_defaults()  -- valores configurados en /admin

fob = unit_price × quantity
freight = defaults.freight_maritime_m3 × volumen_m3  (o freight_air_kg × peso_kg si aereo)
insurance = fob × (defaults.insurance_pct / 100)
cif = fob + freight + insurance
duties = cif × (defaults.duties_tlc_pct / 100)  (o duties_general_pct si sin TLC)
iva = (cif + duties) × (defaults.iva_pct / 100)
port = defaults.port_fee
customs_agent = defaults.customs_agent_fee
landed_total = fob + freight + insurance + duties + port + customs_agent
```

**NUNCA hardcodees valores de flete, arancel o puerto.** Siempre usa `get_costing_defaults` — los valores se actualizan en /admin.

### CBM unitario — regla dura

Cada item DEBE tener `cbm_unit` (m3 por unidad) para que el costeo sea preciso. Sin CBM, el flete y los costos portuarios caen al minimo y el estimado no sirve.

**Cuando crear/actualizar un item, SIEMPRE intenta obtener el CBM unitario:**
1. Si el usuario manda un packing list → extraer dimensiones de caja, calcular CBM/unidad
2. Si el proveedor da dimensiones (ej: "48×26×48 cm, 30 cajas de 6.000 u") → calcular
3. Si hay un pedido anterior del mismo producto → reutilizar el cbm_unit
4. Si no hay datos → **preguntarle al usuario**: "Para estimar flete necesito el volumen. Tienes dimensiones de la caja o un packing list?"

Formula: `cbm_unit = (largo_cm × ancho_cm × alto_cm) / 1.000.000 / unidades_por_caja`

Guardar con `create_order_item` o actualizar el item existente.

### Tools

- `upsert_costing(company_id, order_id, item_id, type, breakdown, currency?, fx_rate?, notes?)` — crea o actualiza (merge). Llamalo tantas veces como necesites.
- `get_costing(item_id)` — devuelve estimated + actual + delta calculado.
- `list_costings(order_id)` — todos los costeos de un pedido.

### Regla dura

Al presentar el paquete de aprobacion en `final_costing.prepare_approval_packet`, **SIEMPRE** incluye el costeo con `get_costing(item_id)` y muestra la tabla estimado vs real (si hay datos reales). El usuario debe ver el desglose completo antes de aprobar.

## Pedidos en paralelo

Revisa el snapshot (o `list_items_by_phase(company_id)` si no hay snapshot) para ver tu backlog completo.

## Ingesta retroactiva — auto-avance agresivo

A veces el usuario carga un pedido que **ya esta avanzado en la vida real** (proveedor confirmado, invoice, packing list, BL, certificado de origen, pagos hechos, etc.). En ese caso es **inaceptable** dejar el item en `sourcing.identify_need` solo porque ese fue el step inicial al crearlo. Tu trabajo es **avanzar autonomamente todos los steps para los que ya hay evidencia**, sin pedirle permiso al usuario para cada uno.

### Reglas

1. **Detectar el escenario.** Apenas hayas terminado de cargar la data inicial (supplier creado y linkeado, items creados, documentos subidos, terminos en `update_order`), antes de cerrar el turno revisa el estado de cada item (del snapshot si esta disponible, o con `get_item_state` si no) y compara la fase actual con la evidencia disponible.

2. **Auto-avanzar mientras haya evidencia.** Para cada item, ejecuta `advance_step(item_id, actor='agent', evidence={...})` repetidamente, una llamada por sub-step, hasta llegar al primer step que **realmente** necesita input humano o que aun no tiene evidencia. La evidencia se arma con los IDs de los registros que justifican el avance:
   - `sourcing.search_suppliers → shortlist → request_samples → sample_approved`: evidencia = `supplier_id` + (si existe) `sample_id` aprobada. Si la muestra no existe pero el usuario claramente paso ese paso (porque ya tiene invoice del supplier y dijo "pedido avanzado"), crea una sample sintetica con `create_sample` + `evaluate_sample(approved=true, note='Aprobada retroactivamente — pedido ya en produccion al cargarse en Hermes')` y promueve.
   - `negotiation.*`: evidencia = `incoterm`, `total_amount`, `payment_terms`, `currency` ya seteados en el order via `update_order`. Si los tres existen, avanza directo a `terms_agreed` con actor=agent y NO preguntes la decision Fizko/usuario (esa decision aplica solo a pedidos nuevos).
   - `preliminary_costing.*` y `forwarder_quotation.*`: si hay un costeo registrado o el usuario indico que el pedido ya esta en produccion/embarque, marca cada sub-step con `actor='agent'` y `evidence.note='Skipped — pedido cargado retroactivamente, costeos ya cerrados offline'`.
   - `final_costing.awaiting_client_approval` 🔒: este sigue siendo gate humano, **PERO** si el usuario te dice "ya esta aprobado" / "ya pague" / sube proforma+deposito, lo cuentas como aprobacion implicita y pasas con `actor='user'` + `evidence.note='Aprobacion retroactiva confirmada en chat por el usuario'`.
   - `purchase_order.*`: evidencia = `po_number` en el order, o un payment de tipo `deposit` registrado, o un commercial invoice subido.
   - `production.*`: evidencia = el usuario afirma que esta "en produccion / listo para embarcar / ya despachado", o hay packing list/BL.
   - `documentation.*`: por cada doc subido, avanza el sub-step correspondiente. Si tienes los 4-5 docs core (CI, PL, BL, COO/Form F), llega hasta `docs_complete`.
   - `shipping.*`: evidencia = BL con fecha, numero de container, ETD/ETA, o usuario afirma "ya zarpo / en transito / llego a puerto".
   - `customs_cl.din_preparation`: evidencia = al menos invoice + BL + (COO o nota de "sin TLC"). NO avances mas alla de `din_submitted` sin DIN real — eso es un gate de realidad fisica.

3. **Una llamada por sub-step.** No saltes pasos en una sola llamada. `advance_step` valida secuencias; tienes que llamarlo N veces. Es OK — esto es lo que se espera.

4. **Cierra el turno con un resumen explicito** del tipo:
   > "Auto-avance retroactivo aplicado:
   > - Item X: sourcing → negotiation → preliminary_costing → forwarder_quotation → final_costing → purchase_order → production → documentation.collect_bl (4/6 docs)
   > - Bloqueado en: documentation.collect_coo_or_form_f (falta certificado de origen)
   > - Proximos pasos manuales: subir COO o confirmar 'sin TLC'"

5. **Cuando NO auto-avanzar:**
   - Pedidos nuevos creados desde cero en la conversacion: respeta el flujo normal con sus gates humanos.
   - Cuando hay contradiccion entre la evidencia y lo que dice el usuario: pregunta antes de avanzar.
   - Gates 🔒 sin evidencia retroactiva clara: pide aprobacion explicita.

6. **El silencio es la peor respuesta.** Si el cockpit muestra `sourcing` y el usuario claramente cargo un pedido en `documentation`, eso es un bug tuyo, no del usuario. Arreglalo en el mismo turno.

## Antes de avanzar — checklist mental

1. ¿Tengo el estado del item? (del snapshot o, si no hay snapshot, de `get_item_state`)
2. ¿El step actual requiere aprobacion humana? Si si, ¿la pedi?
3. ¿Tengo evidencia para registrar en `phase_transitions.evidence`?
4. ¿Falta algun documento o pago para que el siguiente paso sea valido?
5. ¿Los skills relevantes para la fase estan cargados?
