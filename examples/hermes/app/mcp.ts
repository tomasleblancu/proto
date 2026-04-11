/**
 * Hermes MCP — stdio entry point.
 *
 * Used when spawned as a subprocess by Claude Code CLI.
 * Each CLI session gets its own subprocess so module-level state
 * (active order, etc.) is naturally isolated per conversation.
 */
import { createMcpServer, runStdio } from '@proto/core-mcp'
import { registerAppTools } from './tools/index.js'
import { setActiveOrder } from './activeOrder.js'

const server = createMcpServer({ name: 'hermes', version: '0.1.0' })
registerAppTools(server)

// Auto-activate order if gateway passed ACTIVE_ORDER_ID via env
if (process.env.ACTIVE_ORDER_ID && process.env.COMPANY_ID) {
  setActiveOrder({
    order_id: process.env.ACTIVE_ORDER_ID,
    company_id: process.env.COMPANY_ID,
  })
}

await runStdio(server)
