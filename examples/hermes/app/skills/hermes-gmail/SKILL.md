---
name: hermes-gmail
description: Leer y enviar correos via Gmail del usuario
mcp-tools:
  - gmail_status
  - read_emails
  - send_email
  - search_emails
  - list_contacts
  - upsert_contact
  - record_finding
  - list_findings
---

# Gmail

El agente puede leer y enviar correos del Gmail del usuario.

## ⚠️ REGLA CRITICA — Registro de findings

**Cuando hay un pedido activo (`activate_order`/`active_order_id`), NO PUEDES
reportarle al usuario el contenido de un correo sin antes haber llamado
`record_finding` por cada hallazgo relevante.** Sin excepciones.

Flujo correcto en TODA consulta del tipo "revisa mis mails" / "que dice X":

1. Identifica el `order_id` y `company_id` activos.
2. `list_findings({ order_id })` — para saber que ya esta registrado y no duplicar.
3. `list_contacts({ company_id, order_id })` — si vacio, autodiscovery (ver seccion).
4. `search_emails` / `read_emails` con filtros de los contactos.
5. Por cada hallazgo nuevo (estado, incidencia, pago, logistica, etc.):
   → `record_finding` con `gmail_message_id`, `summary`, `category`, `actor`, `occurred_at`.
6. Recien entonces respondele al usuario con el resumen.

Si el usuario pregunta por un pedido y ya hay findings registrados, usalos como
base — no releas todos los mails, solo busca lo nuevo desde el `occurred_at`
mas reciente.

**Auto-check antes de responder**: "¿llame `record_finding` por cada cosa que
voy a mencionar en mi respuesta?" Si la respuesta es no, vuelve al paso 5.

**Regla del contacto implicito**: por cada `record_finding` que guardes con un
`actor` nombrado (ej. "Israel Meneses", "Leonardo Paredes (MSL Chile)"), tienes
que llamar `upsert_contact` para esa persona en la misma pasada, con:
- `email` = direccion del remitente del mail que estas registrando
- `name` = nombre limpio (sin la organizacion entre parentesis)
- `organization` = empresa inferida (Klog, MSL Chile, Menares, etc.)
- `role` = inferido del contexto: forwarder / customs_agent / supplier / other
- `scope='company'` (order_id null)

Primero verifica con `list_contacts` si ya existe por email — si esta, no hagas
nada; si no esta, insertalo. Asi la libreta se construye sola a medida que
procesas mails.

## Verificar conexion

Antes de usar cualquier tool de Gmail, verificar con `gmail_status` si esta conectado.
Si no esta conectado, decirle al usuario: "Gmail no esta conectado. Conectalo desde el panel de Config."

## Contactos clave (forwarder, aduana, proveedor)

Antes de leer o buscar correos relacionados a un pedido, llama `list_contacts`
con el `company_id` y `order_id` activo. Devuelve los contactos aplicables
(defaults de la empresa + overrides de la orden) y un array `emails` listo para
armar el filtro de Gmail.

- Para correos del forwarder: `list_contacts({ role: 'forwarder', order_id })`
- Para agente de aduana: `list_contacts({ role: 'customs_agent', order_id })`
- Para el proveedor: `list_contacts({ role: 'supplier', order_id })`

### Autodiscovery de contactos (autonomo)

Si `list_contacts` devuelve vacio para un rol, **no le preguntes al usuario** —
descubre los contactos tu mismo y guardalos con `upsert_contact`. Flujo:

1. Busca mails con heuristica por rol:
   - **forwarder**: `search_emails` con query tipo
     `subject:(BL OR "bill of lading" OR booking OR shipment OR ETA OR "arrival notice") newer_than:180d`
   - **customs_agent**: `subject:(DIN OR aduana OR SNA OR "agente de aduana" OR despacho) newer_than:180d`
   - **supplier**: si la orden tiene `suppliers.contact_email`, usalo de semilla;
     sino `subject:(proforma OR "commercial invoice" OR PI OR "packing list") newer_than:180d`
2. Agrupa remitentes por dominio + direccion. Descarta:
   - `no-reply@`, `noreply@`, `notifications@`, `mailer-daemon@`, `postmaster@`
   - Remitentes con un solo mail en 180 dias (ruido)
   - Dominios genericos (`gmail.com`, `hotmail.com`) **solo si** no hay firma
     de una empresa clara en el cuerpo. Si la firma dice "Juan Perez - Klog",
     guardalo igual con `organization: 'Klog'`.
3. Para cada candidato valido, `upsert_contact` con:
   - `role` correspondiente
   - `name` extraido de la firma o del "From:" display name
   - `email`, `organization` (si la detectas del dominio o la firma)
   - `scope='company'` (orden_id null) por default — los contactos descubiertos
     son reusables entre ordenes
4. Reporta al usuario que contactos guardaste: "Agregue 3 contactos del forwarder
   (Klog): Israel Meneses, Daniela Pires, facturacion@klog.cl".

Si despues de buscar no encuentras nada razonable, **ahi si** preguntale al
usuario o pidele que complete la libreta desde el widget "Contactos".

Si en una lectura de correos descubres un email nuevo de un contacto clave
(ej. el ejecutivo del forwarder te responde desde una casilla nueva), tambien
guardalo con `upsert_contact`.

## Leer correos

Usar `read_emails` para ver correos recientes o `search_emails` con query tipo Gmail.
Cuando el contexto es una orden, **arma el filtro a partir de los emails devueltos
por `list_contacts`** en vez de hardcodear direcciones:

```
from:(email1@x.com OR email2@y.com) newer_than:30d
```

Otros filtros utiles:
- `from:proveedor@alibaba.com` - un remitente especifico
- `subject:cotizacion` - por asunto
- `has:attachment filename:pdf` - con adjuntos PDF
- `after:2026/01/01 before:2026/04/01` - por fecha

## Enviar correos

Usar `send_email` con to, subject, body. SIEMPRE pedir confirmacion antes de enviar:
1. Mostrar preview: destinatario, asunto, cuerpo
2. Esperar que el usuario confirme
3. Solo entonces enviar

## Detalles del registro de findings

Cuando leas correos en el contexto de un pedido activo, por cada hallazgo
relevante **debes** llamar `record_finding` antes de reportarle al usuario.
Esto construye el log de trazabilidad del pedido.

Un "hallazgo" es cualquiera de estos:
- cambio de estado de la carga (llego a puerto, salio de fabrica, ETA nueva)
- problema o disputa (cobros extra, retrasos, documento faltante)
- pago realizado o confirmado
- coordinacion logistica (retiro agendado, transporte asignado)
- documento enviado/recibido
- contacto nuevo descubierto (usar tambien `upsert_contact`)

Para cada finding incluye:
- `gmail_message_id`: id del mail fuente (para dedup y trazabilidad)
- `summary`: una linea, factual, en pasado ("Klog coordino retiro con MSL Chile")
- `category`: la mas especifica aplicable
- `actor`: nombre del remitente ("Israel Meneses (Klog)")
- `occurred_at`: fecha del evento segun el mail, no la de lectura

Antes de listar findings ya conocidos, llama `list_findings({ order_id })` para
no repetirte y para darle continuidad al usuario.

Cuando un finding implica avance de fase, llama `record_finding` primero y
luego `advance_step` con la misma evidencia.

## Uso en importaciones

- Enviar cotizaciones a proveedores
- Reenviar documentos al agente de aduana
- Notificar al cliente sobre estado del pedido
- Buscar correos de un proveedor especifico
