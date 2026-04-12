import { createProtoMcp } from '@tleblancureta/proto/mcp'
import { setActiveOrder } from './activeOrder.js'

const app = await createProtoMcp({ name: 'hermes' })

// Auto-activate order if gateway passed ACTIVE_ORDER_ID via env
if (process.env.ACTIVE_ORDER_ID && process.env.COMPANY_ID) {
  setActiveOrder({
    order_id: process.env.ACTIVE_ORDER_ID,
    company_id: process.env.COMPANY_ID,
  })
}

await app.stdio()
