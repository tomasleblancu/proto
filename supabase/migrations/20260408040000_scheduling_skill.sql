-- Seed the hermes-scheduling skill into skill_definitions.
-- Content is populated later via `npx tsx packages/gateway/src/scripts/seed-registry.ts`
-- which reads skills/hermes-scheduling/SKILL.md and writes `content`.

INSERT INTO skill_definitions (name, display_name, description, mcp_tools, category, enabled_by_default)
VALUES (
  'hermes-scheduling',
  'Tareas programadas',
  'El agente puede crear, pausar, disparar y modificar sus propios jobs periodicos (crons). Cubre cualquier dominio que requiera recurrencia: mail, recompras, aduana, inventario.',
  ARRAY[
    'schedule_task',
    'list_scheduled_tasks',
    'update_task',
    'pause_task',
    'resume_task',
    'delete_task',
    'trigger_task_now',
    'get_task_runs'
  ],
  'scheduling',
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  mcp_tools = EXCLUDED.mcp_tools,
  category = EXCLUDED.category;
