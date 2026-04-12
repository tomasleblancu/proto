# Proto

TypeScript framework for building AI-agent-driven apps. Provides a gateway (wraps Claude Code CLI), MCP tool server, React shell with widget registry, and Supabase integration.

Apps extend via declarative APIs:

- **`defineTool`** — MCP tools the agent can call
- **`defineWidget`** — React widgets for the shell dashboard
- **`defineEntity`** — activatable objects with cockpit UI and snapshot builders
- **`defineWorkflow`** — state machines with auto-generated MCP tools

## Quick start

```bash
# Create a new app from the minimal template
node packages/create-proto-app/dist/cli.js my-app

cd my-app
npm install
```

The scaffolded app includes:
- 1 entity, 1 workflow, 3 tools, 2 widgets
- MCP entry points (stdio + HTTP)
- React SPA with Shell component
- Supabase migration

See the [scaffold skill](.claude/skills/proto-scaffold/SKILL.md) for the first 5 customization steps.

## Architecture

```
proto/
├── packages/
│   ├── core-gateway/        Hono HTTP+WS, Claude CLI runner, scheduler, mail
│   ├── core-mcp/            MCP server factory, defineTool, helpers
│   ├── core-shared/         Framework types, defineEntity, defineWorkflow
│   ├── core-web/            React Shell, defineWidget, hooks, UI primitives
│   └── create-proto-app/    CLI scaffolder
├── examples/
│   ├── hermes/              Reference app (import management)
│   └── minimal/             Template for scaffolder
└── .claude/skills/          Framework skills for Claude Code
```

## Development

```bash
# Install
npm install

# Build all packages
npm run build

# Run tests
npm test

# Dev servers (using hermes example)
npm run dev:gateway     # Gateway on :8092
npm run dev:web         # Web on :3001

# Dev server (minimal example)
npm run dev:minimal-web # Web on :3002
```

## Deploy

Docker Compose with 2 services (MCP server + gateway):

```bash
docker compose up -d --build
```

See the [deploy skill](.claude/skills/proto-deploy/SKILL.md) for full instructions.

## Framework skills

Claude Code skills for working in this repo:

| Skill | Purpose |
|---|---|
| `proto-tool` | Add/modify MCP tools |
| `proto-widget` | Add/modify shell widgets |
| `proto-entity` | Add/modify activatable entities |
| `proto-workflow` | Add/modify state machine workflows |
| `proto-migration` | SQL migration conventions |
| `proto-scaffold` | Create a new app |
| `proto-debug` | Troubleshooting guide |
| `proto-deploy` | Deployment guide |

## Reference

See [CLAUDE.md](CLAUDE.md) for full architecture documentation.
