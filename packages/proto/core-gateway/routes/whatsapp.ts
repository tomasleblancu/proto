/**
 * WhatsApp webhook routes for Kapso integration.
 *
 * POST /whatsapp/webhook — receives Kapso webhook events
 * GET  /whatsapp/webhook — health check for Kapso webhook verification
 */
import type { Hono } from 'hono'
import {
  KAPSO_API_URL,
  KAPSO_WEBHOOK_SECRET,
} from '../config.js'
import {
  verifyWebhookSignature,
  handleInboundMessage,
} from '../whatsapp-kapso.js'

export function registerWhatsAppRoutes(app: Hono) {
  // Health check — Kapso pings this to verify the webhook URL
  app.get('/whatsapp/webhook', (c) => {
    if (!KAPSO_API_URL) {
      return c.json({ status: 'disabled' }, 404)
    }
    return c.json({ status: 'ok' })
  })

  // Inbound webhook — receives Kapso events
  app.post('/whatsapp/webhook', async (c) => {
    if (!KAPSO_API_URL) {
      return c.json({ error: 'WhatsApp channel not configured' }, 404)
    }

    const rawBody = await c.req.text()

    // Verify signature if secret is configured
    if (KAPSO_WEBHOOK_SECRET) {
      const signature = c.req.header('x-webhook-signature') || ''
      if (!verifyWebhookSignature(KAPSO_WEBHOOK_SECRET, rawBody, signature)) {
        console.warn('[whatsapp-kapso] invalid webhook signature')
        return c.json({ error: 'Invalid signature' }, 401)
      }
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const event = c.req.header('x-webhook-event') || ''

    // Only process inbound messages
    if (event !== 'whatsapp.message.received') {
      return c.json({ status: 'ignored', event })
    }

    // Respond immediately (Kapso requires <10s response)
    // Process the message in the background
    handleInboundMessage(body).catch(err => {
      console.error('[whatsapp-kapso] handler error:', err?.message || err)
    })

    return c.json({ status: 'accepted' })
  })
}
