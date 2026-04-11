import type { Hono } from 'hono'
import { config } from '../config.js'

export function registerHealthRoutes(app: Hono) {
  app.get('/health', async (c) => {
    return c.json({ status: 'ok', project: config.name, ws: true })
  })
}
