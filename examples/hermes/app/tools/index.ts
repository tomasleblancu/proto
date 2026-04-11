/**
 * Hermes app tool registration.
 *
 * Every tool file exports a default array of ToolDefinition objects
 * (created via defineTool). We concat them all and hand the result to
 * registerTools which wraps each handler and calls server.tool() for us.
 *
 * To add a new tool: create a new file with `export default [defineTool(...)]`
 * and append its import to the aggregation below. No need to touch the
 * register function itself.
 */
import type { McpServer } from '@proto/core-mcp'
import { registerUiTools, registerTools } from '@proto/core-mcp'

import activeOrderTools from './active-order.js'
import companyTools from './company.js'
import contactsTools from './contacts.js'
import costingTools from './costing.js'
import documentsTools from './documents.js'
import findingsTools from './findings.js'
import gmailTools from './gmail.js'
import inventoryTools from './inventory.js'
import itemTools from './items.js'
import notificationsTools from './notifications.js'
import ordersTools from './orders.js'
import paymentsTools from './payments.js'
import productsTools from './products.js'
import reordersTools from './reorders.js'
import samplesTools from './samples.js'
import schedulingTools from './scheduling.js'
import sourcingTools from './sourcing.js'
import suppliersTools from './suppliers.js'
import workflowTools from './workflow.js'

const ALL_APP_TOOLS = [
  ...activeOrderTools,
  ...companyTools,
  ...contactsTools,
  ...costingTools,
  ...documentsTools,
  ...findingsTools,
  ...gmailTools,
  ...inventoryTools,
  ...itemTools,
  ...notificationsTools,
  ...ordersTools,
  ...paymentsTools,
  ...productsTools,
  ...reordersTools,
  ...samplesTools,
  ...schedulingTools,
  ...sourcingTools,
  ...suppliersTools,
  ...workflowTools,
]

export function registerAppTools(server: McpServer): void {
  // Framework tool — generative UI (render_ui)
  registerUiTools(server)

  // Domain tools
  registerTools(server, ALL_APP_TOOLS)
}
