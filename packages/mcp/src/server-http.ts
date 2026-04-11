/**
 * Hermes MCP — HTTP server (Streamable HTTP transport).
 *
 * Runs as a standalone service alongside the gateway. Each Claude CLI
 * session gets its own MCP session with isolated active-order state.
 *
 * Data access: Supabase REST API via @supabase/supabase-js.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { registerOrderTools } from './tools/orders.js'
import { registerDocumentTools } from './tools/documents.js'
import { registerReorderTools } from './tools/reorders.js'
import { registerNotificationTools } from './tools/notifications.js'
import { registerCompanyTools } from './tools/company.js'
import { registerProductTools } from './tools/products.js'
import { registerInventoryTools } from './tools/inventory.js'
import { registerGmailTools } from './tools/gmail.js'
import { registerSourcingTools } from './tools/sourcing.js'
import { registerUiTools } from './tools/ui.js'
import { registerWorkflowTools } from './tools/workflow.js'
import { registerSampleTools } from './tools/samples.js'
import { registerPaymentTools } from './tools/payments.js'
import { registerSupplierTools } from './tools/suppliers.js'
import { registerItemTools } from './tools/items.js'
import { registerSchedulingTools } from './tools/scheduling.js'
import { registerActiveOrderTools } from './tools/active-order.js'
import { registerContactTools } from './tools/contacts.js'
import { registerFindingTools } from './tools/findings.js'
import { registerCostingTools } from './tools/costing.js'

// ── Session management ──

const sessions = new Map<string, StreamableHTTPServerTransport>()

function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'hermes', version: '0.2.0' })

  registerOrderTools(server)
  registerDocumentTools(server)
  registerReorderTools(server)
  registerNotificationTools(server)
  registerCompanyTools(server)
  registerProductTools(server)
  registerInventoryTools(server)
  registerGmailTools(server)
  registerSourcingTools(server)
  registerUiTools(server)
  registerWorkflowTools(server)
  registerSampleTools(server)
  registerPaymentTools(server)
  registerSupplierTools(server)
  registerItemTools(server)
  registerSchedulingTools(server)
  registerActiveOrderTools(server)
  registerContactTools(server)
  registerFindingTools(server)
  registerCostingTools(server)

  return server
}

// ── HTTP server ──

const PORT = parseInt(process.env.MCP_PORT || '8093', 10)

const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id')
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }))
    return
  }

  // Only handle /mcp
  if (req.url !== '/mcp') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined

  if (req.method === 'GET' || req.method === 'DELETE') {
    // GET = SSE stream, DELETE = end session — both need existing session
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
    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!
      await transport.handleRequest(req, res)
      return
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })

    const server = createMcpServer()
    await server.connect(transport)

    // Store session after connect (transport.sessionId is set by handleRequest)
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

httpServer.listen(PORT, () => {
  console.log(`Hermes MCP server listening on port ${PORT}`)
})
