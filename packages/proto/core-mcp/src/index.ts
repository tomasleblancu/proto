/**
 * @proto/core-mcp — MCP server framework library.
 *
 * Provides factory functions to build and run MCP servers over stdio or HTTP,
 * plus shared helpers that app-space tools use to compose responses.
 *
 * Apps consume this as a library:
 *
 *   import { createMcpServer, runStdio } from '@tleblancureta/proto/mcp'
 *   const server = createMcpServer({ name: 'my-app' })
 *   registerMyTools(server)
 *   await runStdio(server)
 */
import { createServer as createHttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// ── Re-exports for app tools ──

export { getSupabase } from './supabase.js'
export { ok, json, err, agent, agentErr } from './tools/_helpers.js'
export { registerUiTools } from './tools/ui.js'
export { registerSchedulingTools } from './tools/scheduling.js'
export { McpServer }
export {
  defineTool,
  registerTools,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
  type ToolContext,
} from './define-tool.js'
export { buildEntityTools, registerEntityTools } from './entity-tools.js'
export { buildWorkflowTools, registerWorkflowTools } from './workflow-tools.js'
export { createProtoMcp, type ProtoMcpOptions } from './app.js'

// ── Server factory ──

export interface CreateMcpServerOptions {
  name: string
  version?: string
}

export function createMcpServer(opts: CreateMcpServerOptions): McpServer {
  return new McpServer({
    name: opts.name,
    version: opts.version || '0.1.0',
  })
}

// ── Stdio transport ──

/**
 * Run the given server over stdio. Blocks until the transport closes.
 * Used when the MCP server is spawned as a subprocess by Claude Code CLI.
 */
export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// ── HTTP transport with session management ──

export interface RunHttpOptions {
  port: number
  /**
   * Factory called per-session to build a fresh McpServer with tools registered.
   * Each Claude Code session gets an isolated server instance so active-order
   * (and other per-session state) doesn't leak between users.
   * Receives per-request context (e.g. company_id from x-company-id header).
   */
  buildServer: (ctx: { companyId?: string }) => McpServer
  /** Optional display name used in log output. */
  displayName?: string
}

/**
 * Run an HTTP streamable MCP server with session management.
 * Handles /mcp (POST/GET/DELETE) and /health endpoints.
 */
export async function runHttp(opts: RunHttpOptions): Promise<void> {
  const sessions = new Map<string, StreamableHTTPServerTransport>()
  const name = opts.displayName || 'proto-mcp'

  const httpServer = createHttpServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, x-company-id')
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }))
      return
    }

    if (req.url !== '/mcp') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid or missing session' }))
        return
      }
      const transport = sessions.get(sessionId)!
      await transport.handleRequest(req, res)

      if (req.method === 'DELETE') {
        sessions.delete(sessionId)
      }
      return
    }

    if (req.method === 'POST') {
      if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)!
        await transport.handleRequest(req, res)
        return
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })

      const companyId = req.headers['x-company-id'] as string | undefined
      const server = opts.buildServer({ companyId })
      await server.connect(transport)

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
      }

      await transport.handleRequest(req, res)

      if (transport.sessionId) {
        sessions.set(transport.sessionId, transport)
      }
      return
    }

    res.writeHead(405)
    res.end('Method not allowed')
  })

  return new Promise(resolve => {
    httpServer.listen(opts.port, () => {
      console.log(`${name} MCP server listening on port ${opts.port}`)
      resolve()
    })
  })
}
