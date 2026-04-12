---
name: proto-debug
description: Troubleshoot proto apps — path resolution, session debugging, auth middleware, MCP registration, Claude CLI resume behavior. Activa cuando algo no funciona (ej: "el tool no aparece", "el gateway no encuentra el skill", "error de PROTO_APP_ROOT").
type: framework
---

# proto-debug — troubleshooting guide

Guía para diagnosticar problemas comunes en apps proto. La mayoría son issues de configuración o path resolution, no bugs del framework.

## Cuándo activa este skill

- "el tool no aparece en el agente"
- "error al arrancar el gateway"
- "PROTO_APP_ROOT no funciona"
- "el skill no carga"
- "el MCP server no conecta"
- "session key inválida"

## Path resolution

El problema más común. Todo path en proto se resuelve via `PROTO_APP_ROOT`.

### Cómo funciona

`packages/core-gateway/src/config.ts`:
```ts
function resolveAppRoot(): string {
  const envRoot = process.env.PROTO_APP_ROOT
  if (envRoot) return isAbsolute(envRoot) ? envRoot : resolve(process.cwd(), envRoot)
  if (existsSync(resolve(process.cwd(), 'project.yaml'))) return process.cwd()
  return resolve(__dirname, '..', '..', '..')  // legacy fallback
}
```

### Checklist de path resolution

1. **¿`PROTO_APP_ROOT` está seteado?**
   ```bash
   echo $PROTO_APP_ROOT
   # En Docker:
   docker exec <container> env | grep PROTO
   ```

2. **¿El path tiene `project.yaml`?**
   ```bash
   ls $(echo $PROTO_APP_ROOT)/project.yaml
   # En Docker:
   docker exec <container> ls /app/examples/<app>/project.yaml
   ```

3. **¿Los paths relativos del project.yaml son correctos?**
   ```yaml
   prompts:
     default: app/prompts/default.md   # relativo a PROTO_APP_ROOT
   skills:
     dir: app/skills                    # relativo a PROTO_APP_ROOT
   ```

4. **¿Desde dónde estás corriendo?** Si no seteás `PROTO_APP_ROOT`, el gateway busca `project.yaml` en `cwd`. Si corrés desde la raíz del monorepo, no lo va a encontrar.

### Fix rápido

```bash
# Desarrollo local (desde raíz del monorepo)
PROTO_APP_ROOT=examples/<app> npm run dev:gateway

# Docker
ENV PROTO_APP_ROOT=/app/examples/<app>
```

## MCP tool registration

### "El tool no aparece"

1. **¿Está en el array del archivo de tools?**
   ```bash
   grep 'name:.*<tool_name>' examples/<app>/app/tools/*.ts
   ```

2. **¿El archivo está importado en `tools/index.ts`?**
   ```bash
   grep '<filename>' examples/<app>/app/tools/index.ts
   ```

3. **¿El array spread está en `ALL_APP_TOOLS`?**
   Verificar que `...newTools` esté en la concatenación.

4. **Smoke test:**
   ```bash
   npx tsx -e "
   import { createMcpServer } from '@tleblancureta/proto/mcp'
   import { registerAppTools } from './examples/<app>/app/tools/index.ts'
   const s = createMcpServer({ name: 'test', version: '0.1.0' })
   registerAppTools(s)
   const tools = Object.keys((s as any)._registeredTools)
   console.log('total:', tools.length)
   console.log('found:', tools.includes('<tool_name>'))
   "
   ```

### "El entity tool no aparece" (activate_X, etc.)

Los entity tools se generan via `registerEntityTools(server, ENTITIES)`. Verificar:
- ¿La entity está en el array `ENTITIES` de `entities/index.ts`?
- ¿`registerEntityTools` está siendo llamado en `tools/index.ts`?

### "El workflow tool no aparece" (advance_step, etc.)

Generados via `registerWorkflowTools(server, workflow)`. Verificar:
- ¿El import del workflow es correcto?
- ¿`registerWorkflowTools` está siendo llamado?

## MCP HTTP connection

### "El MCP server no conecta"

1. **¿El server está corriendo?**
   ```bash
   curl http://localhost:8093/health
   # Debería retornar: {"status":"ok","sessions":0}
   ```

2. **¿El puerto es correcto?**
   - Default: 8093 (configurable via `MCP_PORT`)
   - Docker: verificar port mapping en docker-compose.yml

3. **¿El gateway apunta al MCP correcto?**
   ```yaml
   # project.yaml
   mcp:
     servers:
       <name>:
         type: http
         url: http://<host>:8093/mcp   # ← verificar host + path
   ```

## Session debugging

### Session keys

El gateway genera session keys SHA256: `SHA256(companyId:userId:channel)`. Las sessions viven en `/data/sessions/{company}/{sessionKey}/`.

```bash
# Ver sessions activas
ls /data/sessions/

# Session de un usuario específico
ls /data/sessions/<company_id>/
```

### Claude CLI resume

El gateway usa `--resume` para mantener conversaciones. El session ID se guarda en `.claude-session-id` dentro del directorio de la session. Si una conversación está "stuck":

1. Borrar el session file: `rm /data/sessions/<company>/<key>/.claude-session-id`
2. El siguiente mensaje crea una sesión nueva

## Auth middleware

### "401 Unauthorized"

El gateway usa `x-internal-secret` header. Verificar:

```bash
# ¿El secret está seteado?
echo $INTERNAL_SECRET

# ¿El request lo envía?
curl -H "x-internal-secret: $INTERNAL_SECRET" http://localhost:8092/health
```

El web frontend lo envía automáticamente via config (`VITE_INTERNAL_SECRET`).

## Skills no cargan

1. **¿El directorio existe?**
   ```bash
   ls $(echo $PROTO_APP_ROOT)/app/skills/
   ```

2. **¿Los archivos tienen frontmatter YAML válido?**
   ```yaml
   ---
   name: skill-name
   description: one liner
   ---
   ```

3. **¿`registry.ts` los encuentra?**
   ```bash
   PROTO_APP_ROOT=examples/<app> npx tsx -e "
   import { loadSkills } from './packages/core-gateway/src/registry.ts'
   console.log(loadSkills())
   "
   ```

## Build failures

```bash
# Full build (verifica dependencias en orden)
npm run build

# Solo una workspace
npm run build -w packages/proto
npm run build -w @proto-app/<app>-web

# Type check sin compilar
npx tsc --noEmit -p examples/<app>/web/tsconfig.json
```

Orden de build importa: `packages/proto → packages/core-gateway → app-web`. Si algo falla, verificar que las dependencias upstream compilaron.

## Logs útiles

```bash
# Gateway logs
docker compose logs -f agent

# MCP server logs
docker compose logs -f <app>-mcp

# Verbose Claude CLI (dev)
CLAUDE_CODE_DEBUG=1 npm run dev:gateway
```
