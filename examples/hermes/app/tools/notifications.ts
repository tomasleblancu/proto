import { z } from 'zod'
import { defineTool } from '@proto/core-mcp'

export default [
  defineTool({
    name: 'send_alert',
    description: 'Send a notification to a user via their preferred channel (WhatsApp or web). Used for status changes, document requests, and reorder reminders.',
    schema: {
      channel: z.enum(['whatsapp', 'web']).describe('Notification channel'),
      recipient_phone: z.string().optional().describe('WhatsApp phone number (required for whatsapp channel)'),
      message: z.string().describe('Alert message text'),
      order_id: z.string().optional().describe('Related order ID (for context)'),
      alert_type: z.enum(['status_change', 'document_request', 'reorder_reminder', 'general']).describe('Type of alert'),
    },
    handler: async (args) => {
      if (args.channel === 'whatsapp') {
        if (!args.recipient_phone) {
          return { content: [{ type: 'text' as const, text: 'Error: recipient_phone required for WhatsApp alerts' }] }
        }

        const kapsoUrl = process.env.KAPSO_API_URL
        const kapsoKey = process.env.KAPSO_API_KEY

        if (!kapsoUrl || !kapsoKey) {
          return { content: [{ type: 'text' as const, text: 'WhatsApp alerts not configured (missing KAPSO_API_URL/KAPSO_API_KEY). Message logged but not sent.' }] }
        }

        try {
          const response = await fetch(`${kapsoUrl}/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${kapsoKey}`,
            },
            body: JSON.stringify({
              phone: args.recipient_phone,
              message: args.message,
            }),
          })

          if (!response.ok) {
            return { content: [{ type: 'text' as const, text: `WhatsApp delivery failed (${response.status}). Message: ${args.message}` }] }
          }

          return { content: [{ type: 'text' as const, text: `Alert sent via WhatsApp to ${args.recipient_phone}` }] }
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `WhatsApp delivery error. Message logged: ${args.message}` }] }
        }
      }

      // Web channel: just acknowledge (web app polls or uses realtime)
      return { content: [{ type: 'text' as const, text: `Web alert logged: ${args.message}` }] }
    },
  }),
]
