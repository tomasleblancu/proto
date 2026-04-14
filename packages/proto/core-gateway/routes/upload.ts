import type { Hono } from 'hono'
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { DATA_DIR } from '../config.js'

/**
 * Upload route: persists uploaded files to the per-session uploads/ subdir so the
 * Claude CLI subprocess can read them. Files auto-delete after 30min.
 *
 * Files are saved to: data/sessions/<companyId>/<sessionKey>/uploads/<timestamp>-<name>
 * A dedicated uploads/ dir separates user files from session config files (mcp-config.json,
 * system-prompt.md, .claude/). Deduplication: old copies of the same original filename
 * are deleted before saving the new one, so Claude never sees stale versions.
 */
export function registerUploadRoutes(app: Hono) {
  app.post('/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file'] as File
    const companyId = body['company_id'] as string
    const sessionKey = (body['session_key'] as string) || 'web'

    if (!file || !companyId) return c.json({ error: 'file and company_id required' }, 400)

    const uploadsDir = `${DATA_DIR}/sessions/${companyId}/${sessionKey}/uploads`
    mkdirSync(uploadsDir, { recursive: true })

    // Deduplicate: remove old copies of the same original filename
    try {
      const suffix = `-${file.name}`
      for (const existing of readdirSync(uploadsDir)) {
        if (existing.endsWith(suffix)) {
          try { unlinkSync(`${uploadsDir}/${existing}`) } catch {}
        }
      }
    } catch {}

    const filename = `${Date.now()}-${file.name}`
    const filepath = `${uploadsDir}/${filename}`
    writeFileSync(filepath, Buffer.from(await file.arrayBuffer()))

    setTimeout(() => {
      try { unlinkSync(filepath) } catch {}
    }, 30 * 60 * 1000)

    return c.json({ path: filepath, filename })
  })
}
