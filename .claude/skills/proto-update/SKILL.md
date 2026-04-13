---
name: proto-update
description: Actualizar @tleblancureta/proto a la última versión y re-sincronizar skills, migraciones y MCP servers. Activa cuando el usuario dice "update proto", "actualizar proto", "última versión", "sync proto", o "/update-proto".
type: framework
---

# proto-update — update framework package + sync

Actualiza `@tleblancureta/proto` a la última versión y ejecuta `proto-sync` para sincronizar skills, migraciones base y MCP servers por defecto.

## Steps

1. Check if there's a newer version available:
```bash
CURRENT=$(npm ls @tleblancureta/proto --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.dependencies?.['@tleblancureta/proto']?.version||'unknown')")
LATEST=$(npm view @tleblancureta/proto version)
echo "Current: $CURRENT — Latest: $LATEST"
```

2. If CURRENT == LATEST, tell the user they're already on the latest version and stop. Do NOT run npm install.

3. Only if there's a new version, update both root and web:
```bash
npm install @tleblancureta/proto@latest
cd web && npm install @tleblancureta/proto@latest && cd ..
```

4. Run `proto-sync` to synchronize everything:
```bash
npx proto-sync
```

### What `proto-sync` does

`proto-sync` is the single command that keeps a proto app aligned with the framework. It does three things:

| What | Where | Behavior |
|---|---|---|
| **Skills** | `.claude/skills/proto-*` | Overwrites all `proto-*` skills with the latest from the package |
| **Base migrations** | `supabase/migrations/` | Checks if `scheduled_tasks` table exists in any migration. If not, copies the migration with a timestamp after the last existing one. Idempotent. |
| **MCP servers** | `.mcp.json` | Merges default MCP servers (Supabase, Railway) into `.mcp.json`. Only adds servers that don't exist yet — never overwrites existing config. |

If new migrations were added, remind the user to run `supabase db push`.

5. Report the version bump (e.g. "Updated from 0.11.0 → 0.12.2") and summarize what sync did.

## Running sync without updating

If the user just wants to re-sync without changing the package version (e.g. after a fresh clone, or to pick up defaults they deleted):

```bash
npx proto-sync
```

This is safe to run anytime — it's fully idempotent.

## Post-update checks

- If the gateway is running, restart it to pick up backend changes
- If the web dev server is running, Vite will hot-reload frontend changes
- Check the [changelog](https://github.com/tomasleblancu/proto/releases) for breaking changes

## Troubleshooting

- If `proto-sync` is not found, the installed version is < 0.12.0. Update first: `npm install @tleblancureta/proto@latest`, then run `npx proto-sync`.
- If `postinstall` fails in Docker builds, add `--ignore-scripts` to npm install and run `npx proto-sync` separately.
- If MCP servers aren't appearing after sync, check that `.mcp.json` exists and has the `mcpServers` key.
