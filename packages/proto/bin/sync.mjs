#!/usr/bin/env node

/**
 * Copies Claude Code skills from @tleblancureta/proto/skills/ to .claude/skills/
 * and ensures base framework migrations exist in supabase/migrations/.
 *
 * Run manually or via postinstall to keep skills up-to-date with the package version.
 */

import { cpSync, existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const projectRoot = process.cwd()

// ── Skills sync ─────────────────────────────────────────────────────────

const skillsSrc = resolve(pkgRoot, 'skills')
const skillsDest = resolve(projectRoot, '.claude', 'skills')

if (!existsSync(skillsSrc)) {
  console.error('Skills source not found:', skillsSrc)
  process.exit(1)
}

const skills = readdirSync(skillsSrc).filter((d) => d.startsWith('proto-'))
let skillCount = 0

for (const skill of skills) {
  const src = resolve(skillsSrc, skill)
  const dest = resolve(skillsDest, skill)
  cpSync(src, dest, { recursive: true })
  skillCount++
}

console.log(`proto: synced ${skillCount} skills to .claude/skills/`)

// ── Migrations sync ─────────────────────────────────────────────────────
// Each file in packages/proto/migrations/<name>.sql is a base migration.
// We check if the app already has it by grepping existing migrations for
// a marker (e.g. "CREATE TABLE.*scheduled_tasks"). If not found, we copy
// it with a new timestamp so it sorts after existing migrations.

const migrationsSrc = resolve(pkgRoot, 'migrations')
const migrationsDest = resolve(projectRoot, 'supabase', 'migrations')

if (existsSync(migrationsSrc) && existsSync(migrationsDest)) {
  /** Map of migration name → marker regex to detect if already applied */
  const MIGRATION_MARKERS = {
    'scheduled_tasks.sql': /CREATE TABLE[^;]*scheduled_tasks/i,
  }

  // Read all existing migration content once
  const existingFiles = readdirSync(migrationsDest).filter((f) => f.endsWith('.sql'))
  const existingContent = existingFiles.map((f) =>
    readFileSync(resolve(migrationsDest, f), 'utf-8'),
  )

  const baseMigrations = readdirSync(migrationsSrc).filter((f) => f.endsWith('.sql'))
  let migCount = 0

  for (const file of baseMigrations) {
    const marker = MIGRATION_MARKERS[file]
    if (!marker) continue

    // Check if any existing migration already has this table/object
    const alreadyExists = existingContent.some((content) => marker.test(content))
    if (alreadyExists) continue

    // Generate timestamp: find the latest existing prefix and add 1 second
    const latestPrefix = existingFiles
      .map((f) => f.match(/^(\d{14})/)?.[1])
      .filter(Boolean)
      .sort()
      .pop()

    let ts
    if (latestPrefix) {
      // Increment the last timestamp by 1 second
      const num = BigInt(latestPrefix) + 1n
      ts = num.toString()
    } else {
      // No migrations yet — use current UTC time
      const now = new Date()
      ts = now.toISOString().replace(/[-T:Z.]/g, '').slice(0, 14)
    }

    const destName = `${ts}_${file}`
    copyFileSync(resolve(migrationsSrc, file), resolve(migrationsDest, destName))
    console.log(`proto: added migration ${destName}`)
    migCount++
  }

  if (migCount > 0) {
    console.log(`proto: ${migCount} base migration(s) added — run "supabase db push" to apply`)
  }
}
