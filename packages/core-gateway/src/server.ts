import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createNodeWebSocket } from '@hono/node-ws'
import { serve } from '@hono/node-server'
import { verifySecret } from './auth.js'
import { config, PORT } from './config.js'
import { registerChatRoutes } from './routes/chat.js'
import { registerUploadRoutes } from './routes/upload.js'
import { registerGmailRoutes } from './routes/gmail.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerCronRoutes } from './routes/cron.js'
import { startMailIngester } from './mail-ingester.js'

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

// --- Start ---
console.log(`${config.display_name} Gateway starting on port ${PORT}`)
const server = serve({ fetch: app.fetch, port: PORT })
injectWebSocket(server)

// Start the IMAP ingester (no-op if HERMES_IMAP_HOST not configured)
startMailIngester()
