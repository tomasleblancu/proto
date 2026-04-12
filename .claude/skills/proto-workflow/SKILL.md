---
name: proto-workflow
description: Agregar o modificar un workflow (state machine) en una app proto via defineWorkflow. Activa cuando el usuario quiere un proceso multi-fase con transiciones, gates humanos, y tools auto-generados (ej: "agregá un workflow de aprobaciones", "necesito un state machine para reembolsos", "el workflow de import debería tener una fase nueva").
type: framework
---

# proto-workflow — agregar un workflow state machine

Un workflow describe un proceso multi-fase sobre filas de una tabla Supabase. Cada fase tiene sub-pasos; los items avanzan bajo control del agente o del usuario; las transiciones se registran en un history table. `defineWorkflow` es la declaración, `buildWorkflowTools` genera las 9 MCP tools del state machine automáticamente.

## Cuándo activa este skill

- "agregá un workflow de aprobaciones"
- "necesito un state machine para reembolsos"
- "el workflow de import debería tener una fase nueva"
- "quiero que <fase>.<step> requiera aprobación humana"
- "agregá un step a la fase X"
- "mostrame cómo agregar un workflow"

## Dónde va el archivo

Los workflows viven en `<app>/app/workflows/*.ts` con un archivo por workflow:

```
examples/hermes/app/workflows/
└── import.ts      ← workflow de importación (13 fases, 49 steps)
```

## Shape de un workflow

```ts
// examples/hermes/app/workflows/approval.ts
import { defineWorkflow } from '@tleblancureta/proto/shared'

export default defineWorkflow({
  name: 'approval',
  displayName: 'aprobacion',
  entityTable: 'approval_items',         // filas stateful
  transitionsTable: 'approval_transitions', // history

  phases: [
    {
      name: 'submitted',
      label: 'Enviado',
      steps: ['draft', 'ready_for_review'],
      execution: { skills: ['approval-reviewer'], fork: false },
    },
    {
      name: 'reviewing',
      label: 'En revisión',
      steps: ['in_review', 'changes_requested', 'revised'],
    },
    {
      name: 'decision',
      label: 'Decisión',
      steps: [
        'compute_decision',
        { name: 'awaiting_signoff', requires_human_approval: true },
        'approved',
      ],
      execution: { skills: ['approval-reviewer'], fork: false },
    },
    {
      name: 'closed',
      label: 'Cerrado',
      steps: ['notified', 'archived'],
    },
  ],

  stepHints: {
    'decision.compute_decision':
      'Llama get_approval_data para juntar los inputs antes de avanzar al gate humano.',
  },
})
```

## Qué genera `buildWorkflowTools`

Por cada workflow, se generan 9 MCP tools con nombres default compatibles con skills existentes:

- `get_item_state(item_id)` — snapshot fase/step/flags + hint del próximo paso
- `list_items_by_phase(company_id, phase?, include_cancelled?)` — listado filtrable
- `advance_step(item_id, to_phase, to_step, actor, reason?, evidence?)` — transición validada
- `block_item(item_id, reason)` / `unblock_item(item_id)`
- `hold_item(item_id)` / `resume_item(item_id)`
- `cancel_item(item_id, reason?)` — terminal
- `request_human_approval(item_id, packet)` — marca un gate de approval como pending

**Validaciones automáticas:**
- Step debe existir en la fase target (`workflowIsValidStep`)
- Solo se puede avanzar 1 fase a la vez (forward-only)
- Items `cancelled` / `on_hold` / `blocked_reason` no avanzan
- Gates con `requires_human_approval` rechazan `actor !== 'user'`
- Transition se escribe a `transitionsTable` con actor, reason, evidence

## Multi-workflow y colisiones de nombres

Los nombres default están optimizados para 1 workflow por app. Si tenés 2+ workflows en la misma app, overrideá `toolNames` en cada uno para evitar colisiones:

```ts
defineWorkflow({
  name: 'reorder',
  toolNames: {
    getState: 'get_reorder_state',
    listByPhase: 'list_reorders_by_phase',
    advanceStep: 'advance_reorder_step',
    blockItem: 'block_reorder',
    unblockItem: 'unblock_reorder',
    holdItem: 'hold_reorder',
    resumeItem: 'resume_reorder',
    cancelItem: 'cancel_reorder',
    requestHumanApproval: 'request_reorder_approval',
  },
  // ...
})
```

## Columnas de la tabla

Los defaults matchean el schema Hermes (`order_items`):

| campo | default | descripción |
|---|---|---|
| `columns.phase` | `current_phase` | columna con la fase actual |
| `columns.step` | `current_step` | columna con el step actual |
| `columns.onHold` | `on_hold` | bool |
| `columns.blocked` | `blocked_reason` | string o null |
| `columns.cancelled` | `cancelled` | bool |
| `columns.company` | `company_id` | multi-tenant filter |
| `columns.updatedAt` | `updated_at` | timestamp auto-set en cada mutation |

Si la tabla del nuevo workflow tiene nombres distintos, overrideá via el field `columns: { ... }`.

## Fields del defineWorkflow

- **`name`** — id único del workflow (ej: `import`, `approval`, `reorder`).
- **`displayName`** — singular humano para las descriptions ("...del workflow `importacion`").
- **`entityTable`** — tabla Supabase con las filas stateful.
- **`transitionsTable`** — tabla donde se escriben las transitions (schema esperado: `item_id, company_id, from_phase, to_phase, from_step, to_step, actor, reason, evidence`).
- **`columns`** *(opcional)* — overrides de columnas si el schema difiere del default.
- **`phases`** — array ordenado (forward-only) de `WorkflowPhase`. El orden define `phaseIndex`.
  - **`name`** — id único de la fase.
  - **`label`** *(opcional)* — nombre humano para UI.
  - **`steps`** — array de `string | { name, requires_human_approval: true }`. El step marcado rechaza transitions de `actor !== 'user'`.
  - **`execution`** *(opcional)* — metadata para cargar skills / forkear subagent en esta fase. Lee del orquestador agéntico cuando exista.
- **`stepHints`** *(opcional)* — `Record<string, string>` keyed por `"<phase>.<step>"`. El generator los surfacea en el response de `get_item_state` y `advance_step`. Para guiar al agente al próximo tool después de un step específico.
- **`toolNames`** *(opcional)* — overrides de los 9 nombres generados.

## Después de agregar el workflow

1. **No hay que registrar manualmente** — `createProtoMcp()` auto-descubre todos los archivos en `app/workflows/`. Solo creá el archivo y listo.

2. **Crear las migraciones**:
   - Tabla `entityTable` con columnas `id`, `company_id`, `current_phase`, `current_step`, `on_hold`, `blocked_reason`, `cancelled`, `updated_at` (o los nombres custom).
   - Tabla `transitionsTable` con columnas `item_id`, `company_id`, `from_phase`, `to_phase`, `from_step`, `to_step`, `actor`, `reason`, `evidence jsonb`, `ts` (default now()).
   - RLS policies que permiten al service role escribir y al auth'd user leer su company.

3. **Derivar helpers legacy** si otros tools necesitan `PHASES`, `PHASE_LABELS`, etc del nuevo workflow:
   ```ts
   // al final de workflows/approval.ts
   import { workflowPhaseNames, workflowPhaseLabels, workflowAllPhaseSteps } from '@tleblancureta/proto/shared'
   export const APPROVAL_PHASES = workflowPhaseNames(approvalWorkflow)
   export const APPROVAL_PHASE_LABELS = workflowPhaseLabels(approvalWorkflow)
   export const APPROVAL_PHASE_STEPS = workflowAllPhaseSteps(approvalWorkflow)
   ```

4. **Smoke test** — verificá que los tools se generaron:
   ```bash
   cd examples/<app> && npx tsx -e "
   const { createProtoMcp } = await import('@tleblancureta/proto/mcp')
   const app = await createProtoMcp({ name: '<app>' })
   console.log('tools:', app.toolCount)
   "
   ```

5. **Skill de dominio** — creá un skill narrativo que le cuente al agente cómo usar el workflow (orden de las fases, cuáles son los gates humanos, step hints importantes). El workflow def tiene los datos; el skill tiene la prosa.

## Reglas

1. **Forward-only**: el generator rechaza transitions `to_phase < from_phase`. Si necesitás rollback, usá `block_item` + una transition manual vía SQL. No hay rollback automático.

2. **Un fase a la vez**: no podés saltarte fases (`fromIdx + 1` max). Para jumps largos, agregá una "fast track" fase intermedia.

3. **Gates humanos**: marcá el step con `{ name, requires_human_approval: true }`. El generator rechaza `advance_step(..., actor='agent')` en ese step. La UI debe llamar `advance_step(..., actor='user')` tras confirmación.

4. **`stepHints` son narrativa, no lógica**: el generator NO usa los hints para decisiones — solo los surfacea al agente como texto ("próximo paso sugerido"). Si necesitás validación más rica, un tool custom aparte.

5. **No hardcodees `company_id`**: el filter `company_id` viene como arg de `list_items_by_phase` y de las otras tools derivan del row mismo.

6. **El workflow file debe ser isomórfico**: sin imports de Node o React. Compila desde Node (MCP) y también desde el browser si necesitás derivar helpers legacy (como hace `workflows/import.ts`).

## Anti-patterns

- ❌ **Lógica de negocio en los handlers del generator** — el generator es framework. Hermes-specific no va ahí. Para lógica custom (ej: validar que un documento existe antes de avanzar), creá un tool aparte que envuelva `advance_step`.
- ❌ **Fases con 0 steps** — el step validator explota. Siempre al menos un step por fase.
- ❌ **Steps duplicados entre fases** — no funciona bien con el `buildStepHint` "next phase first step". Hacé los step names únicos globalmente o aceptá que el hint puede confundirse.
- ❌ **Forkear skills dentro del handler** — `execution.fork` y `execution.skills` son metadata para el orquestador, no dispara nada hoy. Se conecta cuando el orquestador agéntico lea estos fields.
- ❌ **Múltiples workflows sin `toolNames` override** — colisión de nombres. Siempre overrideá para el segundo workflow en adelante.
- ❌ **Renombrar columnas en runtime via patch** — setealo en `defineWorkflow.columns` una vez y punto.

## Checklist antes de cerrar

- [ ] Archivo en `<app>/app/workflows/<name>.ts`
- [ ] `export default defineWorkflow({...})`
- [ ] `name`, `displayName`, `entityTable`, `transitionsTable` presentes
- [ ] `phases` array no vacío, cada fase con `steps` no vacío
- [ ] Gates humanos marcados con `{ name, requires_human_approval: true }`
- [ ] Si hay 2+ workflows en el app: `toolNames` overriden
- [ ] `tools/index.ts` registra via `registerWorkflowTools(server, <name>Workflow)`
- [ ] Migraciones de `entityTable` + `transitionsTable` creadas
- [ ] RLS policies en su lugar
- [ ] Smoke test muestra los 9 tools generados
- [ ] Skill de dominio narrativo creado o actualizado
