import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { chatRequestSchema } from '@proto/core-shared'
import { verifySecret } from '../auth.js'
import { runClaude, streamClaude } from '../claude-runner.js'
import { checkRateLimit } from '../rate-limiter.js'
import { INTERNAL_SECRET } from '../config.js'

type UpgradeWebSocket = (handler: (c: any) => any) => any

/**
 * Chat routes: WebSocket streaming (primary), REST /chat + /chat/stream
 * (legacy), and /reset for Claude CLI session invalidation.
 */
export function registerChatRoutes(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
  // --- WebSocket ---
  app.get('/ws', upgradeWebSocket(() => {
    let authenticated = false

    return {
      onMessage(event: any, ws: any) {
        try {
          const data = JSON.parse(event.data.toString())

          // First message must be auth
          if (!authenticated) {
            if (data.type === 'auth' && data.secret === INTERNAL_SECRET) {
              authenticated = true
              ws.send(JSON.stringify({ type: 'auth', status: 'ok' }))
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
              ws.close(4001, 'Unauthorized')
            }
            return
          }

          if (data.type === 'chat') {
            handleWsChat(data, ws)
          } else if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          }
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }))
        }
      },
      onClose() {},
      onError() {},
    }
  }))

  // --- REST /reset ---
  app.post('/reset', verifySecret, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const companyId = body?.company_id
    const sessionKey = body?.session_key
    if (!companyId) return c.json({ error: 'company_id required' }, 400)
    try {
      const { join, resolve } = await import('node:path')
      const { existsSync, rmSync } = await import('node:fs')
      const dataRoot = process.env.DATA_DIR || '/data'
      const slug = sessionKey ? `${companyId}/${sessionKey}` : companyId
      const sessionDir = resolve(dataRoot, 'sessions', slug)
      const file = join(sessionDir, '.claude-session-id')
      if (existsSync(file)) rmSync(file, { force: true })
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ error: err.message || 'reset failed' }, 500)
    }
  })

  // --- REST /chat ---
  app.post('/chat', async (c) => {
    const body = await c.req.json()
    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.format() }, 400)

    const { allowed, retryAfterMs } = checkRateLimit(parsed.data.company_id)
    if (!allowed) {
      const retryMin = Math.ceil((retryAfterMs || 0) / 60000)
      return c.json({ error: `Rate limit exceeded. Try again in ${retryMin} minutes.` }, 429)
    }

    try {
      const result = await runClaude(parsed.data)
      return c.json(result)
    } catch (err: any) {
      if (err.message?.includes('timed out')) return c.json({ error: 'Claude Code session timed out' }, 504)
      return c.json({ error: err.message || 'Claude Code error' }, 502)
    }
  })

  // --- REST /chat/stream (SSE) ---
  app.post('/chat/stream', async (c) => {
    const body = await c.req.json()
    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.format() }, 400)

    const { allowed, retryAfterMs } = checkRateLimit(parsed.data.company_id)
    if (!allowed) {
      const retryMin = Math.ceil((retryAfterMs || 0) / 60000)
      return c.json({ error: `Rate limit exceeded. Try again in ${retryMin} minutes.` }, 429)
    }

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of streamClaude(parsed.data)) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err: any) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: err.message }) })
      }
    })
  })
}

function safeSend(ws: any, data: string): boolean {
  try {
    ws.send(data)
    return true
  } catch {
    return false // socket closed
  }
}

async function handleWsChat(data: any, ws: any) {
  const parsed = chatRequestSchema.safeParse(data)
  if (!parsed.success) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid request' }))
    return
  }

  const { allowed, retryAfterMs } = checkRateLimit(parsed.data.company_id)
  if (!allowed) {
    const retryMin = Math.ceil((retryAfterMs || 0) / 60000)
    safeSend(ws, JSON.stringify({ type: 'error', message: `Rate limit. Retry in ${retryMin} min` }))
    return
  }

  try {
    for await (const event of streamClaude(parsed.data)) {
      if (!safeSend(ws, JSON.stringify(event))) {
        // Client disconnected — break out so the generator can clean up
        break
      }

      // Push shell refresh on tool_result and result
      if (event.type === 'tool_result' || event.type === 'result') {
        safeSend(ws, JSON.stringify({ type: 'shell_refresh' }))
      }
    }
  } catch (err: any) {
    safeSend(ws, JSON.stringify({ type: 'error', message: err.message }))
  }
}
