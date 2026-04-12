import { mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SKILLS = [
  'proto-tool',
  'proto-widget',
  'proto-entity',
  'proto-workflow',
  'proto-migration',
  'proto-debug',
  'proto-deploy',
]

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export function copySkills(skillsSource: string, targetDir: string): void {
  if (!existsSync(skillsSource)) return

  const destSkills = join(targetDir, '.claude', 'skills')

  for (const skill of SKILLS) {
    const src = join(skillsSource, skill)
    if (existsSync(src)) {
      copyDir(src, join(destSkills, skill))
    }
  }
}
