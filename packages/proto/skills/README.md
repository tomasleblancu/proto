# Framework skills

Esta carpeta contiene **framework skills** para Claude Code: guías operativas que Claude lee cuando trabajás en el repo proto (localmente, durante development). **No** son domain skills del agente que corre en producción — esos viven en `examples/<app>/app/skills/`.

## Disponibles

| Skill | Cuándo activa |
|---|---|
| [`proto-tool/`](./proto-tool/SKILL.md) | "agregá un tool para X", "el agente debería poder Y", "el tool Z no funciona" |
| [`proto-widget/`](./proto-widget/SKILL.md) | "agregá un widget para X", "mostrame Y en el shell", "el widget Z debería Q" |
| [`proto-entity/`](./proto-entity/SKILL.md) | "agregá un entity para X", "quiero cockpit para Y", "el agente debería activar Z" |
| [`proto-workflow/`](./proto-workflow/SKILL.md) | "agregá un workflow para X", "necesito state machine", "la fase Y debería tener step Z" |
| [`proto-migration/`](./proto-migration/SKILL.md) | "creá una tabla para X", "agregá RLS", "necesito un trigger" |
| [`proto-debug/`](./proto-debug/SKILL.md) | "el tool no aparece", "error de PROTO_APP_ROOT", "el gateway no arranca" |
| [`proto-deploy/`](./proto-deploy/SKILL.md) | "cómo deployeo", "configurar Docker", "env vars de producción" |
| [`proto-scaffold/`](./proto-scaffold/SKILL.md) | "creá una app nueva", "scaffold un proyecto", "cómo arranco" |

## Formato

Cada skill es un directorio con un `SKILL.md`. YAML frontmatter:

```md
---
name: proto-<noun>
description: <acción + trigger phrases>
type: framework
---

# proto-<noun> — <título>

<prose>
```

## Distribution

Estos skills los copiará `create-proto-app` en cada app nueva como starting point editable.

Para más contexto: ver `CLAUDE.md` del root — sección "Framework skills".
