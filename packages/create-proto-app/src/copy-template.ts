import { mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP = new Set(['node_modules', 'dist', '.tsbuildinfo'])

function shouldSkip(name: string): boolean {
  return SKIP.has(name) || name.endsWith('.tsbuildinfo')
}

export function copyTemplate(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(src)) {
    if (shouldSkip(entry)) continue

    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      copyTemplate(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}
