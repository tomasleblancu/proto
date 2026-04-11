---
name: hermes-scheduling
description: Tareas programadas (cron). Permite al agente crear, pausar, disparar y modificar sus propios jobs periodicos sobre cualquier dominio (mail, recompras, aduana, inventario).
mcp-tools:
  - schedule_task
  - list_scheduled_tasks
  - update_task
  - pause_task
  - resume_task
  - delete_task
  - trigger_task_now
  - get_task_runs
---

# Scheduling — el agente se programa a si mismo

## Principio

Cualquier trabajo recurrente (revisar mail, escanear recompras, pollear aduana, recordatorios) no se resuelve "ahora mismo" con una llamada unica — se resuelve **programando una tarea** que vuelva a ejecutarte en intervalos regulares. Vos sos el que crea y gestiona esas tareas.

Cuando el usuario dice cosas como:
- "revisa mi mail cada 15 minutos"
- "chequea recompras todas las mañanas a las 9"
- "avisame si alguna DIN cambia de estado"
- "todos los lunes mandame un resumen de pedidos"
- "deja de revisar el mail"

... la respuesta correcta es un llamado a `schedule_task` / `pause_task` / `delete_task`, NO hacer el trabajo una sola vez y olvidarlo.

## Modelo mental

Una `scheduled_task` es una `(cron_expr, prompt, enabled_skills)` guardada en DB. Cuando llega su momento, el gateway ejecuta **una nueva invocacion tuya** con ese prompt exacto y esas skills — una sesion separada de la actual, sin memoria del chat en vivo.

Implicaciones:
- **El prompt debe ser self-contained.** La tarea no ve el chat del usuario. Si la instruccion depende de contexto ("el pedido del que estabamos hablando"), tenes que expandir ese contexto explicitamente en el prompt antes de guardarlo.
- **Memoria entre runs:** si queres que runs sucesivos recuerden estado (ej: "no notifiques dos veces el mismo email"), pasa `session_key: "slug-estable"` al crear la tarea — todos los runs comparten la misma sesion de Claude CLI y ven el historial.
- **Skills explicitas:** pasa solo las que la tarea necesita. Menos ruido = mejor razonamiento. Ej: revisar mail → `["hermes-gmail","hermes-orders","hermes-intake"]`, no toda la lista.

## Flujo tipico

### Crear una tarea nueva

1. Confirma el intent con el usuario en una frase ("Entiendo, voy a programar una revision de tu inbox cada 15 min. Se ejecuta incluso con Hermes cerrado. Confirmas?").
2. Elegi un `name` slug descriptivo, unico por empresa (ej: `check-inbox`, `daily-reorder-scan`, `weekly-status-report`).
3. Traduci el intervalo a cron de 5 campos:
   - `*/15 * * * *` → cada 15 min
   - `0 9 * * *` → diario 9am
   - `0 9 * * 1-5` → lunes a viernes 9am
   - `0 9 * * 1` → lunes 9am
   - `0 */4 * * *` → cada 4 horas
4. Escribi el `prompt` como si se lo mandaras a otro agente fresco: incluye company_id, alcance ("revisa los ultimos 7 dias", "solo pedidos en production"), y que hacer con los hallazgos (crear eventos, notificar, actualizar campos).
5. Llama `schedule_task(...)`.
6. Confirma al usuario: nombre, cuando corre, que hace, y como pausarlo.

### Listar / inspeccionar

- `list_scheduled_tasks(company_id)` — te da todas las tareas activas y pausadas con su `next_run_at` y el status del ultimo run.
- `get_task_runs(task_id, limit)` — historial de ejecuciones para debuggear fallas. Cada run trae `error`, `response`, `duration_ms`, `trigger`.

### Pausar / reanudar / borrar

- `pause_task(task_id)` — desactiva sin borrar. `next_run_at` queda null. No corre hasta resume.
- `resume_task(task_id)` — reactiva y recomputa el proximo run.
- `delete_task(task_id)` — borra definicion + historial (cascade).

### Modificar

- `update_task(task_id, ...campos)` — cambiar cron_expr, prompt, skills, etc. Si cambia `cron_expr` o `timezone`, `next_run_at` se recomputa automaticamente.

### Forzar un run inmediato

- `trigger_task_now(task_id)` — dispara en background sin esperar al cron. El run aparece en el historial con `trigger="manual"`. Util para debug o cuando el usuario dice "correlo ya".

## Ejemplos completos

### Ejemplo 1: inbox polling cada 15 min con memoria

```
schedule_task({
  company_id: "<id>",
  name: "inbox-poller",
  description: "Procesa cotizaciones y updates logisticos del inbox",
  cron_expr: "*/15 * * * *",
  prompt: "Revisa el mail de los ultimos 20 minutos buscando: 1) cotizaciones de proveedores Alibaba 2) confirmaciones de PO 3) updates de tracking 4) documentos de aduana. Para cada hit, intenta asociarlo a un pedido existente con list_orders y create un order_event. NO respondas mails automaticamente — solo registra hallazgos. Si encontras un PDF adjunto, descargalo y analiza su tipo con attach_document.",
  enabled_skills: ["hermes-gmail","hermes-orders","hermes-intake","hermes-documents"],
  session_key: "inbox-poller"   // memoria persistente: no procesa dos veces el mismo mail
})
```

### Ejemplo 2: scan diario de recompras

```
schedule_task({
  company_id: "<id>",
  name: "daily-reorder-scan",
  description: "Detecta productos que requieren reorden",
  cron_expr: "0 9 * * 1-5",     // lunes a viernes 9am Santiago
  prompt: "Corre check_reorders para la empresa. Para cada rule que dispara, genera una propuesta con list_reorder_rules + calculate_reorder_quantity. NO ejecutes trigger_reorder automaticamente — solo crea order_events con tipo 'reorder_suggestion' y deja que el humano decida.",
  enabled_skills: ["hermes-reorders","hermes-inventory","hermes-orders"]
})
```

### Ejemplo 3: reporte semanal al usuario

```
schedule_task({
  company_id: "<id>",
  name: "weekly-summary",
  description: "Resumen de pedidos activos cada lunes 8am",
  cron_expr: "0 8 * * 1",
  prompt: "Arma un resumen de los pedidos activos: list_items_by_phase(company_id) → agrupa por fase → para cada pedido bloqueado o on_hold incluye la razon. No hace falta notificar — solo queda en task_runs para que el usuario lo vea en la UI.",
  enabled_skills: ["hermes-orders"]
})
```

## Reglas

1. **Siempre confirma antes de crear.** No programes sin que el usuario lo pida explicitamente o confirme cuando lo sugeris.
2. **Slugs descriptivos.** `check-inbox` si, `task-1` no. El nombre aparece en la UI.
3. **Un tarea = un proposito.** Mejor tres tareas chicas que una gigante que hace de todo.
4. **No crees tareas sobre datos del chat en vivo.** Si el usuario dice "programame un recordatorio de este pedido", expanda: "programo una revision del pedido PO123456 cada lunes a las 9am, confirmas?".
5. **Revisa task_runs cuando el usuario pregunte por fallas.** `get_task_runs` te da el historial con errores — es tu primer paso para debuggear.
6. **Si el usuario dice "deja de X" y no aclara, mostra primero `list_scheduled_tasks` y pregunta cual pausar.**

## Los tres canales de email en Hermes

Antes de programar nada que involucre mail, tenes que distinguir **tres cosas distintas** que muchas veces se llaman "mail" pero son independientes:

| Canal | Direccion | De quien | Para que |
|---|---|---|---|
| **Hermes system mail** (outbound) | Hermes → usuario | Mail interno del sistema (una cuenta compartida entre todos los clientes) | Notificaciones de tareas programadas, alertas, reportes |
| **Hermes system mail** (inbound, Fase 2) | usuario → Hermes | El mismo inbox del sistema | Usuario manda un comando por mail y Hermes lo procesa |
| **User personal inbox** | Mails que recibe el usuario de sus proveedores, aduana, clientes, etc | Cuenta Gmail propia del usuario, conectada via OAuth (`gmail_tokens`) | El agente LEE/analiza el inbox del usuario con `read_emails`, `search_emails`, o `send_email` para que el usuario responda desde su cuenta |

**Regla clave:** las notificaciones de tareas programadas (`output_channel='email'`) usan el mail del sistema Hermes, **no** la cuenta Gmail del usuario. El usuario NO necesita tener Gmail conectado para recibir notificaciones de sus tasks. La cuenta Gmail del usuario solo es relevante cuando el agente tiene que tocar el inbox personal del usuario (leer cotizaciones que llegaron de proveedores, por ejemplo).

## Canales de output — cuando avisar por email

Por default, el resultado de un run queda en `task_runs` y el usuario solo lo ve si abre `SchedulesWidget`. Para cron tasks que el usuario **no va a mirar activamente**, el resultado debe llegarle por **email** al finalizar cada run.

### Campos relevantes al crear/editar

- `output_channel`: `silent` (default) | `email`
- `output_recipient`: email del destinatario (obligatorio si channel=email). El remitente siempre es el mail del sistema Hermes.
- `notify_on`:
  - `always` — en cada run, exitoso o fallido
  - `on_change` — solo si el status cambio respecto del run anterior (ideal para checks repetitivos que no queres que spammeen)
  - `on_error` — solo cuando el run falla (ideal para monitoreo pasivo)
  - `never` — equivalente a `silent`, util para pausar notificaciones temporalmente sin tocar el canal

### Cuando elegir que

| Caso | Channel | notify_on |
|---|---|---|
| Polling de inbox cada 15 min | silent | — (los hallazgos se registran via events, no hace falta mail) |
| Resumen semanal de pedidos | email | always |
| Check diario de pedidos bloqueados | email | on_change |
| Monitor de pagos vencidos | email | on_error |
| Backup / housekeeping | silent | — |

### Ejemplo: resumen semanal con email

```
schedule_task({
  company_id: "<id>",
  name: "weekly-status-report",
  cron_expr: "0 8 * * 1",
  prompt: "Arma un resumen ejecutivo de los pedidos activos: agrupa por fase, lista los bloqueados con razon, y destaca los que llegaron a gates humanos esta semana. Formato: 4-6 lineas, directo.",
  enabled_skills: ["hermes-orders"],
  output_channel: "email",
  output_recipient: "tomas@atal.cl",
  notify_on: "always"
})
```

## Canal de input: leer el inbox personal del usuario

Esto es distinto de los dos canales anteriores: aca el usuario **ya recibio un mail en su propia cuenta** (de un proveedor, aduana, forwarder, etc.) y quiere que Hermes lo lea, clasifique, y actue. Usa `read_emails` / `search_emails` via `hermes-gmail`. Requiere que el usuario haya conectado su Gmail (fila en `gmail_tokens`) — si no, las tools fallan.

Esto NO es "el usuario le habla a Hermes por mail" — eso seria inbound del sistema Hermes (Fase 2, no implementado aun). Esto es "el agente tiene permiso para leer el inbox del usuario y hacer cosas con eso".

### Patron: polling del inbox del usuario

Patron:

```
schedule_task({
  name: "email-inbox-agent",
  cron_expr: "*/5 * * * *",
  prompt: `Lee los ultimos mails no leidos en la bandeja de tomas@atal.cl.
    Para cada uno:
      1. Si es spam o ruido, marcalo como leido y seguí.
      2. Si es un update de proveedor / aduana, asocialo a un pedido existente (list_orders, create order_event).
      3. Si es una pregunta o pedido del usuario, procesalo como si fuera un chat: entendelo, ejecuta las tools necesarias, y RESPONDE via send_email al remitente (nunca a terceros). Firma como "Hermes".
    Al terminar, marca todos como leidos.`,
  enabled_skills: ["hermes-gmail","hermes-orders","hermes-intake","hermes-scheduling"],
  session_key: "email-inbox-agent",  // memoria persistente: no reprocesa el mismo mail dos veces
  output_channel: "silent"            // ya respondemos via send_email dentro del run, no duplicar
})
```

Limitaciones de este approach:
- **Requiere Gmail del usuario conectado.** Si el usuario no tiene `gmail_tokens`, las tools fallan.
- **Opera sobre el inbox del usuario**, no sobre el mail del sistema Hermes. Si el usuario quiere que Hermes conteste "desde" Hermes (no desde su propia cuenta), esto no sirve — para eso hay que esperar Fase 2 del canal Hermes inbound.
- **Sin threading real** (no conservamos `In-Reply-To` / `References`).
- **Latencia ≥ intervalo del cron** (5 min).
- Si el agente falla a mitad de procesar un mail, puede quedar en estado inconsistente (usar `session_key` persistente ayuda: recordas que ya procesaste un mail especifico).

## Diferenciar los tres casos cuando el usuario habla de "mail"

Cuando el usuario dice algo relacionado con email, identifica cual de los tres casos es:

| Frase del usuario | Canal | Accion |
|---|---|---|
| "avisame por mail cuando termine la tarea" | Hermes outbound (notificacion) | `schedule_task({ output_channel: "email", output_recipient: "<user>" })` |
| "revisa mi bandeja todas las mañanas" | User personal inbox | `schedule_task` con prompt que use `read_emails` (requiere Gmail conectado) |
| "quiero escribirle a Hermes por mail" | Hermes inbound (Fase 2) | ✅ Funciona. El mail del sistema Hermes tiene un poller IMAP que lee replies y los procesa como chat. Requiere que la direccion del usuario este en `companies.contact_email` o `profiles.email` (allowlist). |
| "respondeme el mail que te mande a Hermes" | Hermes inbound | ✅ Idem. Si el usuario replica a una notificacion tuya, el poller la rutea al mismo thread y mantenes continuidad via el `session_key` del thread. |
| "responde este mail que me llego" | User personal inbox, `send_email` | Redactas la respuesta, usas `send_email` para responder desde la cuenta del usuario. |

## Anti-patterns

- ❌ "Revisa mi mail" → ejecutar `read_emails` una vez. **Siempre pregunta si quiere programarlo o es one-shot.**
- ❌ Crear tareas con cron `* * * * *` (cada minuto) salvo que sea un poller critico. Default a 5–15 min.
- ❌ Pasar el chat en vivo como contexto del prompt. La tarea no tiene acceso al historial del chat del usuario.
- ❌ Borrar en vez de pausar. Si el usuario podria querer reactivarla, `pause_task` es mejor que `delete_task`.
