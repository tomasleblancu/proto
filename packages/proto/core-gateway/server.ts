import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createNodeWebSocket } from '@hono/node-ws'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifySecret } from './auth.js'
import { config, APP_ROOT, PORT } from './config.js'
import { registerChatRoutes } from './routes/chat.js'
import { registerUploadRoutes } from './routes/upload.js'
import { registerGmailRoutes } from './routes/gmail.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerCronRoutes } from './routes/cron.js'
import { registerAdminRoutes } from './routes/admin.js'
import { startMailIngester } from './mail-ingester.js'

export interface GatewayOptions {
  /** Override the port (default: PORT env or 8090). */
  port?: number
}

/**
 * Create and start the Proto gateway server.
 *
 * Usage:
 *   import { createProtoGateway } from '@tleblancureta/proto/gateway'
 *   await createProtoGateway()
 */
export async function createProtoGateway(opts?: GatewayOptions) {
  const port = opts?.port ?? PORT

  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.use('*', cors())

  // Auth middleware for REST endpoints (WS uses its own auth handshake)
  app.use('/chat', verifySecret)
  app.use('/chat/*', verifySecret)
  app.use('/upload/*', verifySecret)

  // Mount routes
  registerChatRoutes(app, upgradeWebSocket as any)
  registerUploadRoutes(app)
  registerGmailRoutes(app)
  registerHealthRoutes(app)
  registerCronRoutes(app)
  registerAdminRoutes(app)

  // Serve frontend static files if web/dist exists (all-in-one deploy)
  const webDistRel = resolve(APP_ROOT, 'web/dist').replace(process.cwd() + '/', '')
  const webDistAbs = resolve(APP_ROOT, 'web/dist')
  if (existsSync(webDistAbs)) {
    console.log(`${config.display_name} Serving frontend from ${webDistAbs}`)
    app.use('/assets/*', serveStatic({ root: webDistRel }))
    app.use('/favicon.ico', serveStatic({ root: webDistRel }))

    // SPA fallback: non-API routes get index.html
    const indexHtml = readFileSync(resolve(webDistAbs, 'index.html'), 'utf-8')
    app.get('*', (c) => c.html(indexHtml))
  }

  // Start
  console.log(`${config.display_name} Gateway starting on port ${port}`)
  const server = serve({ fetch: app.fetch, port })
  injectWebSocket(server)

  // Start the IMAP ingester (no-op if MAIL_IMAP_HOST not configured)
  startMailIngester()

  return { app, server }
}
