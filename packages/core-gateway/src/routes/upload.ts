import type { Hono } from 'hono'

/**
 * Upload route: persists uploaded files to the per-session data dir so the
 * Claude CLI subprocess can read them back. Files auto-delete after 5min.
 */
export function registerUploadRoutes(app: Hono) {
  app.post('/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file'] as File
    const companyId = body['company_id'] as string
    const sessionKey = (body['session_key'] as string) || 'web'

    if (!file || !companyId) return c.json({ error: 'file and company_id required' }, 400)

    const dataRoot = process.env.DATA_DIR || '/data'
    const sessionDir = `${dataRoot}/sessions/${companyId}/${sessionKey}`
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(sessionDir, { recursive: true })

    const filename = `${Date.now()}-${file.name}`
    const filepath = `${sessionDir}/${filename}`
    const buffer = Buffer.from(await file.arrayBuffer())
    writeFileSync(filepath, buffer)

    setTimeout(async () => {
      try { const { unlinkSync } = await import('node:fs'); unlinkSync(filepath) } catch {}
    }, 30 * 60 * 1000)

    return c.json({ path: filepath, filename })
  })
}
