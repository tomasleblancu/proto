/**
 * Hermes MCP — HTTP streamable entry point.
 *
 * Runs as a standalone service (Docker compose "mcp") alongside the gateway.
 * Each Claude CLI session gets its own MCP session with isolated
 * per-session state (buildServer is called fresh for each new session).
 */
import { createMcpServer, runHttp } from '@proto/core-mcp'
import { registerAppTools } from './tools/index.js'

const PORT = parseInt(process.env.MCP_PORT || '8093', 10)

await runHttp({
  port: PORT,
  displayName: 'hermes',
  buildServer: () => {
    const server = createMcpServer({ name: 'hermes', version: '0.1.0' })
    registerAppTools(server)
    return server
  },
})
