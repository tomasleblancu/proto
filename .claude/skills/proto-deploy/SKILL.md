---
name: proto-deploy
description: Deploy de apps proto via Docker Compose o Railway. Activa cuando el usuario pregunta por deploy, Docker, producción, env vars, o health checks (ej: "cómo deployeo", "configurar Docker", "env vars de producción").
type: framework
---

# proto-deploy — deployment guide

Las apps proto se deployean via Docker Compose (self-hosted) o Railway (PaaS). La arquitectura de deploy tiene 2 servicios: el gateway (API + chat) y el MCP server (herramientas del agente).

## Cuándo activa este skill

- "cómo deployeo esto"
- "configurar Docker compose"
- "qué env vars necesito en producción"
- "cómo hago health check"
- "Railway deploy"

## Arquitectura de deploy

```
┌─────────────────┐     ┌─────────────────┐
│  Browser / App   │────▶│    Gateway       │
│  (port 3001 dev) │     │  (port 8092)     │
└─────────────────┘     │  - Hono HTTP/WS  │
                        │  - Claude CLI     │
                        │  - Scheduler      │
                        │  - Mail           │
                        └────────┬──────────┘
                                 │ MCP HTTP
                                 ▼
                        ┌──���──────────────┐
                        │   MCP Server     │
                        │  (port 8093)     │
                        │  - Tools         ��
                        │  - Entity/WF     │
                        └─────────────────┘
```

## Docker Compose

### docker-compose.yml base

```yaml
services:
  <app>-mcp:
    build:
      context: .
      dockerfile: Dockerfile
    command: npx tsx examples/<app>/app/mcp-http.ts
    ports:
      - "8093:8093"
    environment:
      - MCP_PORT=8093
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8093/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  agent:
    build:
      context: .
      dockerfile: Dockerfile
    command: npx tsx packages/core-gateway/src/server.ts
    ports:
      - "8092:8092"
    environment:
      - PROTO_APP_ROOT=/app/examples/<app>
      - PORT=8092
      - INTERNAL_SECRET=${INTERNAL_SECRET}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      <app>-mcp:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8092/health"]
      interval: 10s
      timeout: 5s
      retries: 3
```

### Dockerfile base

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/ packages/
COPY examples/ examples/

RUN npm ci --omit=dev

ENV PROTO_APP_ROOT=/app/examples/<app>
ENV NODE_ENV=production

EXPOSE 8092 8093
```

### Comandos

```bash
# Build + start
docker compose up -d --build

# Logs
docker compose logs -f agent
docker compose logs -f <app>-mcp

# Restart
docker compose restart

# Rebuild un servicio
docker compose up -d --build agent
```

## Environment variables

### Requeridas

| Variable | Servicio | Descripción |
|---|---|---|
| `PROTO_APP_ROOT` | gateway | Path al app dir dentro del container |
| `SUPABASE_URL` | ambos | URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ambos | Service role key (server-side) |
| `ANTHROPIC_API_KEY` | gateway | Key de Anthropic para Claude CLI |
| `INTERNAL_SECRET` | gateway | Shared secret para auth entre frontend y gateway |
| `MCP_PORT` | mcp | Puerto del MCP server (default 8093) |
| `PORT` | gateway | Puerto del gateway (default 8092) |

### Frontend (Vite)

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL de Supabase (public) |
| `VITE_SUPABASE_ANON_KEY` | Anon key de Supabase (public) |
| `VITE_GATEWAY_URL` | URL del gateway (ej: `http://localhost:8092`) |
| `VITE_INTERNAL_SECRET` | Shared secret |

### Opcionales

| Variable | Descripción |
|---|---|
| `MAX_TURNS` | Límite de tool-use turns por mensaje (default 50) |
| `HERMES_SMTP_*` | SMTP config para mail channel |
| `HERMES_IMAP_*` | IMAP config para mail ingestion |

## Railway

### railway.toml

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 10
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[[services]]
name = "agent"
```

Railway auto-detecta el Dockerfile. Env vars se setean en el dashboard.

### Deploy

```bash
railway up           # deploy
railway logs         # ver logs
railway status       # estado del deploy
```

## Health checks

Ambos servicios exponen `/health`:

```bash
# Gateway
curl http://localhost:8092/health
# → {"status":"ok"}

# MCP
curl http://localhost:8093/health
# → {"status":"ok","sessions":0}
```

## Zero-downtime restart

Docker compose no tiene blue-green nativo. Para updates:

1. `docker compose pull` (si usás image registry)
2. `docker compose up -d --build` — reconstruye y reinicia
3. Health check previene tráfico antes de ready

Para Railway, los deploys son automáticamente zero-downtime (rolling).

## Checklist pre-deploy

1. [ ] `.env` o `.env.docker` tiene todas las variables
2. [ ] `PROTO_APP_ROOT` apunta al directorio correcto dentro del container
3. [ ] `project.yaml` existe en ese path
4. [ ] MCP server URL en `project.yaml` matchea el hostname Docker (`<service-name>:<port>`)
5. [ ] `npm run build` pasa localmente
6. [ ] `docker compose build` compila sin errores
7. [ ] Health checks responden después de `docker compose up`
