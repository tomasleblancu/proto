# Framework skills

Esta carpeta contiene **framework skills** para Claude Code: guías operativas que Claude lee cuando trabajás en el repo proto (localmente, durante development). **No** son domain skills del agente que corre en producción — esos viven en `examples/<app>/app/skills/`.

## Disponibles

| Skill | Cuándo activa |
|---|---|
| [`proto-tool/`](./proto-tool/SKILL.md) | "agregá un tool para X", "el agente debería poder Y", "el tool Z no funciona" |
| [`proto-widget/`](./proto-widget/SKILL.md) | "agregá un widget para X", "mostrame Y en el shell", "el widget Z debería Q" |
| [`proto-entity/`](./proto-entity/SKILL.md) | "agregá un entity para X", "quiero cockpit para Y", "el agente debería activar Z" |
| [`proto-workflow/`](./proto-workflow/SKILL.md) | "agregá un workflow para X", "necesito state machine", "la fase Y debería tener step Z" |

## Pendientes (coming with framework phases)

| Skill | Requiere fase |
|---|---|
| `proto-migration` | — (documenta SQL migration conventions) |
| `proto-channel` | — (futuro `defineChannel` para WhatsApp/Gmail/etc) |
| `proto-scaffold` | 3g — `create-proto-app` |
| `proto-debug` | — (troubleshooting: logs, sessions, auth, path resolution) |
| `proto-deploy` | — (Docker compose, Railway, env vars) |

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

Estos skills los copiará `create-proto-app` (Phase 3g) en cada app nueva como starting point editable. Hasta entonces son solo para trabajar en el proto repo directamente.

Para más contexto: ver `CLAUDE.md` del root — sección "Framework skills".
