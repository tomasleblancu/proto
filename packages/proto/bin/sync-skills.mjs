#!/usr/bin/env node

/**
 * Copies Claude Code skills from @tleblancureta/proto/skills/ to .claude/skills/
 * Run manually or via postinstall to keep skills up-to-date with the package version.
 */

import { cpSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsSrc = resolve(__dirname, '..', 'skills')
const projectRoot = process.cwd()
const skillsDest = resolve(projectRoot, '.claude', 'skills')

if (!existsSync(skillsSrc)) {
  console.error('Skills source not found:', skillsSrc)
  process.exit(1)
}

const skills = readdirSync(skillsSrc).filter((d) => d.startsWith('proto-'))
let count = 0

for (const skill of skills) {
  const src = resolve(skillsSrc, skill)
  const dest = resolve(skillsDest, skill)
  cpSync(src, dest, { recursive: true })
  count++
}

console.log(`proto: synced ${count} skills to .claude/skills/`)
