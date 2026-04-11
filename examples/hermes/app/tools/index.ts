/**
 * Hermes app tool registration.
 *
 * Called once per MCP server instance (stdio or HTTP session) to register
 * all Hermes-specific tools. The core framework provides render_ui via
 * registerUiTools — we call that here too so every Hermes session has it.
 *
 * Migration note (phase 3a): tool files are moving from the old
 * `registerXTools(server)` function-export shape to the new
 * `export default [defineTool(...), ...]` array-export shape. Both are
 * called below and coexist during the migration.
 */
import type { McpServer } from '@proto/core-mcp'
import { registerUiTools, registerTools } from '@proto/core-mcp'

// ── New-style tools (defineTool + default array export) ──
import itemTools from './items.js'

// ── Old-style tools (registerXTools function export) ──
import { registerOrderTools } from './orders.js'
import { registerDocumentTools } from './documents.js'
import { registerReorderTools } from './reorders.js'
import { registerNotificationTools } from './notifications.js'
import { registerCompanyTools } from './company.js'
import { registerProductTools } from './products.js'
import { registerInventoryTools } from './inventory.js'
import { registerGmailTools } from './gmail.js'
import { registerSourcingTools } from './sourcing.js'
import { registerWorkflowTools } from './workflow.js'
import { registerSampleTools } from './samples.js'
import { registerPaymentTools } from './payments.js'
import { registerSupplierTools } from './suppliers.js'
import { registerSchedulingTools } from './scheduling.js'
import { registerActiveOrderTools } from './active-order.js'
import { registerContactTools } from './contacts.js'
import { registerFindingTools } from './findings.js'
import { registerCostingTools } from './costing.js'

export function registerAppTools(server: McpServer): void {
  // Framework tools (render_ui)
  registerUiTools(server)

  // New-style tools
  registerTools(server, itemTools)

  // Hermes domain tools (legacy shape — being migrated to defineTool)
  registerOrderTools(server)
  registerDocumentTools(server)
  registerReorderTools(server)
  registerNotificationTools(server)
  registerCompanyTools(server)
  registerProductTools(server)
  registerInventoryTools(server)
  registerGmailTools(server)
  registerSourcingTools(server)
  registerWorkflowTools(server)
  registerSampleTools(server)
  registerPaymentTools(server)
  registerSupplierTools(server)
  registerSchedulingTools(server)
  registerActiveOrderTools(server)
  registerContactTools(server)
  registerFindingTools(server)
  registerCostingTools(server)
}
