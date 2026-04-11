import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
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

const ALLOWED_TOOLS = (process.env.ALLOWED_TOOLS || '')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean)

const server = new McpServer({
  name: 'hermes',
  version: '0.1.0',
})

// Register all tool modules
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

// Auto-activate order if gateway passed ACTIVE_ORDER_ID via env
if (process.env.ACTIVE_ORDER_ID && process.env.COMPANY_ID) {
  const { setActiveOrder } = await import('./activeOrder.js')
  setActiveOrder({
    order_id: process.env.ACTIVE_ORDER_ID,
    company_id: process.env.COMPANY_ID,
  })
}

// Start server with stdio transport (Claude Code communicates via stdin/stdout)
const transport = new StdioServerTransport()
await server.connect(transport)
