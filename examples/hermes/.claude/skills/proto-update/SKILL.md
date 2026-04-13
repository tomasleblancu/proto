---
name: proto-update
description: Actualizar @tleblancureta/proto a la última versión y re-sincronizar skills. Activa cuando el usuario dice "update proto", "actualizar proto", "última versión", o "/update-proto".
type: framework
---

# proto-update — update framework package + skills

Actualiza `@tleblancureta/proto` a la última versión y re-sincroniza los Claude Code skills.

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

4. Re-sync Claude Code skills and base migrations:
```bash
npx proto-sync
```
This also checks if base framework migrations (e.g. `scheduled_tasks`) are missing from `supabase/migrations/` and copies them with a fresh timestamp if needed. If new migrations were added, remind the user to run `supabase db push`.

5. Report the version bump (e.g. "Updated from 0.7.0 → 0.8.0") and suggest checking the changelog.

## Post-update checks

- If the gateway is running, restart it to pick up backend changes
- If the web dev server is running, Vite will hot-reload frontend changes
- Check the [changelog](https://github.com/tomasleblancu/proto/releases) for breaking changes

## Troubleshooting

- If `proto-sync` is not found, the installed version is < 0.7.0. Update first, then sync.
- If `postinstall` fails in Docker builds, add `--ignore-scripts` to npm install and run `npx proto-sync` separately.
